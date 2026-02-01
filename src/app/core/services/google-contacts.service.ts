import { Injectable, inject, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, of, catchError, map } from 'rxjs';
import { AuthService } from '../auth/auth.service';

/**
 * Google People API person representation
 * Based on https://developers.google.com/people/api/rest/v1/people
 */
export interface GooglePerson {
  resourceName?: string;
  etag?: string;
  names?: Array<{
    displayName?: string;
    givenName?: string;
    familyName?: string;
    metadata?: { primary?: boolean };
  }>;
  emailAddresses?: Array<{
    value?: string;
    type?: string;
    metadata?: { primary?: boolean };
  }>;
  photos?: Array<{
    url?: string;
    metadata?: { primary?: boolean };
  }>;
  organizations?: Array<{
    name?: string;
    title?: string;
    department?: string;
  }>;
}

/**
 * Google People API response for listing connections/contacts
 */
export interface GooglePeopleResponse {
  connections?: GooglePerson[];
  nextPageToken?: string;
  totalPeople?: number;
  totalItems?: number;
}

/**
 * Google Directory API response for listing domain users
 */
export interface GoogleDirectoryResponse {
  users?: GoogleDirectoryUser[];
  nextPageToken?: string;
}

export interface GoogleDirectoryUser {
  id?: string;
  primaryEmail?: string;
  name?: {
    givenName?: string;
    familyName?: string;
    fullName?: string;
  };
  thumbnailPhotoUrl?: string;
  orgUnitPath?: string;
  isAdmin?: boolean;
  isDelegatedAdmin?: boolean;
  suspended?: boolean;
}

/**
 * Simplified contact format for use in the app
 */
export interface GoogleContact {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  source: 'google-contacts' | 'google-directory';
}

@Injectable({
  providedIn: 'root',
})
export class GoogleContactsService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  
  private readonly PEOPLE_API_BASE_URL = 'https://people.googleapis.com/v1';
  private readonly ADMIN_API_BASE_URL = 'https://admin.googleapis.com/admin/directory/v1';

  // Authentication state - computed from auth service token
  isAuthenticated = computed(() => !!this.authService.googleTasksAccessToken());

  /**
   * Get HTTP headers with OAuth access token
   */
  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.googleTasksAccessToken();
    if (!token) {
      throw new Error('Google API not authenticated. Please sign in again.');
    }
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
  }

  /**
   * Get the user's Google Contacts (personal contacts)
   * Uses the People API connections endpoint
   */
  getContacts(pageSize: number = 100): Observable<GoogleContact[]> {
    if (!this.isAuthenticated()) {
      return of([]);
    }

    const personFields = 'names,emailAddresses,photos';
    const url = `${this.PEOPLE_API_BASE_URL}/people/me/connections?personFields=${personFields}&pageSize=${pageSize}`;

    return this.http.get<GooglePeopleResponse>(url, {
      headers: this.getAuthHeaders(),
    }).pipe(
      map((response) => this.mapPeopleToContacts(response.connections || [], 'google-contacts')),
      catchError((err) => {
        console.warn('Failed to fetch Google Contacts:', err);
        return of([]);
      })
    );
  }

  /**
   * Get domain users from Google Workspace Directory
   * Note: This requires admin privileges or domain-wide delegation
   * For regular users, this may fail - we handle gracefully
   */
  getDomainUsers(domain: string = 'omniflexfitness.com', pageSize: number = 100): Observable<GoogleContact[]> {
    if (!this.isAuthenticated()) {
      return of([]);
    }

    const url = `${this.ADMIN_API_BASE_URL}/users?domain=${domain}&maxResults=${pageSize}&orderBy=email`;

    return this.http.get<GoogleDirectoryResponse>(url, {
      headers: this.getAuthHeaders(),
    }).pipe(
      map((response) => this.mapDirectoryUsersToContacts(response.users || [])),
      catchError((err) => {
        // This is expected to fail for non-admin users
        console.warn('Failed to fetch Directory users (may require admin privileges):', err);
        return of([]);
      })
    );
  }

  /**
   * Search contacts using the People API otherContacts endpoint
   * This searches across all contacts the user can see
   */
  searchContacts(query: string, pageSize: number = 20): Observable<GoogleContact[]> {
    if (!this.isAuthenticated() || !query.trim()) {
      return of([]);
    }

    const personFields = 'names,emailAddresses,photos';
    const url = `${this.PEOPLE_API_BASE_URL}/people:searchContacts?query=${encodeURIComponent(query)}&readMask=${personFields}&pageSize=${pageSize}`;

    return this.http.get<{ results?: Array<{ person: GooglePerson }> }>(url, {
      headers: this.getAuthHeaders(),
    }).pipe(
      map((response) => {
        const people = (response.results || []).map(r => r.person);
        return this.mapPeopleToContacts(people, 'google-contacts');
      }),
      catchError((err) => {
        console.warn('Failed to search Google Contacts:', err);
        return of([]);
      })
    );
  }

  /**
   * Get "other contacts" - contacts inferred from interactions (emails, etc.)
   * These are contacts not explicitly added by the user
   */
  getOtherContacts(pageSize: number = 100): Observable<GoogleContact[]> {
    if (!this.isAuthenticated()) {
      return of([]);
    }

    const readMask = 'names,emailAddresses,photos';
    const url = `${this.PEOPLE_API_BASE_URL}/otherContacts?readMask=${readMask}&pageSize=${pageSize}`;

    return this.http.get<{ otherContacts?: GooglePerson[] }>(url, {
      headers: this.getAuthHeaders(),
    }).pipe(
      map((response) => this.mapPeopleToContacts(response.otherContacts || [], 'google-contacts')),
      catchError((err) => {
        console.warn('Failed to fetch other contacts:', err);
        return of([]);
      })
    );
  }

  /**
   * Get directory people (domain contacts visible to the user)
   * This works for Google Workspace users to see other users in their organization
   */
  getDirectoryPeople(pageSize: number = 100): Observable<GoogleContact[]> {
    if (!this.isAuthenticated()) {
      return of([]);
    }

    const readMask = 'names,emailAddresses,photos';
    const sources = 'DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE';
    const url = `${this.PEOPLE_API_BASE_URL}/people:listDirectoryPeople?readMask=${readMask}&sources=${sources}&pageSize=${pageSize}`;

    return this.http.get<{ people?: GooglePerson[] }>(url, {
      headers: this.getAuthHeaders(),
    }).pipe(
      map((response) => this.mapPeopleToContacts(response.people || [], 'google-directory')),
      catchError((err) => {
        console.warn('Failed to fetch directory people:', err);
        return of([]);
      })
    );
  }

  /**
   * Search directory people (domain contacts)
   */
  searchDirectoryPeople(query: string, pageSize: number = 20): Observable<GoogleContact[]> {
    if (!this.isAuthenticated() || !query.trim()) {
      return of([]);
    }

    const readMask = 'names,emailAddresses,photos';
    const sources = 'DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE';
    const url = `${this.PEOPLE_API_BASE_URL}/people:searchDirectoryPeople?query=${encodeURIComponent(query)}&readMask=${readMask}&sources=${sources}&pageSize=${pageSize}`;

    return this.http.get<{ people?: GooglePerson[] }>(url, {
      headers: this.getAuthHeaders(),
    }).pipe(
      map((response) => this.mapPeopleToContacts(response.people || [], 'google-directory')),
      catchError((err) => {
        console.warn('Failed to search directory people:', err);
        return of([]);
      })
    );
  }

  /**
   * Map Google People API response to simplified contact format
   */
  private mapPeopleToContacts(people: GooglePerson[], source: 'google-contacts' | 'google-directory'): GoogleContact[] {
    const contacts: GoogleContact[] = [];
    
    for (const person of people) {
      // Get primary or first email
      const emailAddress = person.emailAddresses?.find(e => e.metadata?.primary) || person.emailAddresses?.[0];
      const email = emailAddress?.value;

      if (!email) continue; // Skip contacts without email

      // Get primary or first name
      const nameData = person.names?.find(n => n.metadata?.primary) || person.names?.[0];
      const displayName = nameData?.displayName || email.split('@')[0];

      // Get primary or first photo
      const photoData = person.photos?.find(p => p.metadata?.primary) || person.photos?.[0];
      const photoURL = photoData?.url;

      contacts.push({
        id: email, // Use email as ID for deduplication
        email,
        displayName,
        photoURL,
        source,
      });
    }
    
    return contacts;
  }

  /**
   * Map Google Directory API response to simplified contact format
   */
  private mapDirectoryUsersToContacts(users: GoogleDirectoryUser[]): GoogleContact[] {
    return users
      .filter((user) => !user.suspended && user.primaryEmail)
      .map((user) => ({
        id: user.primaryEmail!,
        email: user.primaryEmail!,
        displayName: user.name?.fullName || user.primaryEmail!.split('@')[0],
        photoURL: user.thumbnailPhotoUrl,
        source: 'google-directory' as const,
      }));
  }
}

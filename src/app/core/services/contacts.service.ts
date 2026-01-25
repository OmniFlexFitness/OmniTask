import { Injectable, inject, signal } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  limit,
  getDocs,
  where,
  orderBy,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable, from, of, catchError, map, shareReplay, combineLatest, forkJoin, switchMap, tap, BehaviorSubject } from 'rxjs';
import { UserProfile } from '../models/user.model';
import { GoogleContactsService, GoogleContact } from './google-contacts.service';

export interface Contact {
  id: string; // email or uid
  email: string;
  displayName: string;
  photoURL?: string;
  source: 'workspace' | 'app' | 'google-contacts' | 'google-directory' | 'default-domain';
}

@Injectable({
  providedIn: 'root',
})
export class ContactsService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);
  private googleContactsService = inject(GoogleContactsService);

  // Cache for contacts
  private contactsCache$: Observable<Contact[]> | null = null;
  
  // Loading state
  private loadingSubject = new BehaviorSubject<boolean>(false);
  loading$ = this.loadingSubject.asObservable();

  // Default domain for omniflexfitness.com emails
  private readonly DEFAULT_DOMAIN = 'omniflexfitness.com';

  /**
   * Get all available contacts (cached)
   * Combines multiple sources:
   * 1. App users from Firestore
   * 2. Google Directory people (domain users)
   * 3. Google Contacts (personal contacts)
   * 4. Default domain emails
   */
  getContacts(): Observable<Contact[]> {
    if (!this.contactsCache$) {
      this.loadingSubject.next(true);
      
      this.contactsCache$ = combineLatest([
        from(this.fetchAppUsers()).pipe(
          map((users) => users.map((u) => this.mapUserToContact(u))),
          catchError(() => of([]))
        ),
        this.googleContactsService.getDirectoryPeople().pipe(
          map((contacts) => contacts.map((c) => this.mapGoogleContactToContact(c))),
          catchError(() => of([]))
        ),
        this.googleContactsService.getContacts().pipe(
          map((contacts) => contacts.map((c) => this.mapGoogleContactToContact(c))),
          catchError(() => of([]))
        ),
        this.googleContactsService.getOtherContacts().pipe(
          map((contacts) => contacts.map((c) => this.mapGoogleContactToContact(c))),
          catchError(() => of([]))
        ),
      ]).pipe(
        map(([appUsers, directoryPeople, googleContacts, otherContacts]) => {
          // Merge and deduplicate contacts by email
          const allContacts = [...appUsers, ...directoryPeople, ...googleContacts, ...otherContacts];
          return this.deduplicateContacts(allContacts);
        }),
        tap(() => this.loadingSubject.next(false)),
        shareReplay(1),
        catchError((err) => {
          console.error('Failed to fetch contacts', err);
          this.loadingSubject.next(false);
          return of([]);
        })
      );
    }
    return this.contactsCache$;
  }

  /**
   * Get contacts filtered to only omniflexfitness.com domain
   * This ensures all domain emails are available as assignees by default
   */
  getDomainContacts(): Observable<Contact[]> {
    return this.getContacts().pipe(
      map((contacts) => 
        contacts.filter((c) => c.email.toLowerCase().endsWith(`@${this.DEFAULT_DOMAIN}`))
      )
    );
  }

  /**
   * Search contacts with predictive matching
   * Filters across name and email
   */
  searchContacts(queryStr: string): Observable<Contact[]> {
    if (!queryStr || !queryStr.trim()) {
      return this.getContacts();
    }

    const q = queryStr.toLowerCase().trim();

    // First search locally cached contacts
    return this.getContacts().pipe(
      switchMap((cachedContacts) => {
        const localResults = cachedContacts.filter(
          (c) =>
            c.displayName.toLowerCase().includes(q) ||
            c.email.toLowerCase().includes(q)
        );

        // If we have enough local results, return them
        if (localResults.length >= 5) {
          return of(localResults);
        }

        // Otherwise, also search Google Directory for more results
        return combineLatest([
          of(localResults),
          this.googleContactsService.searchDirectoryPeople(queryStr).pipe(
            map((contacts) => contacts.map((c) => this.mapGoogleContactToContact(c))),
            catchError(() => of([]))
          ),
          this.googleContactsService.searchContacts(queryStr).pipe(
            map((contacts) => contacts.map((c) => this.mapGoogleContactToContact(c))),
            catchError(() => of([]))
          ),
        ]).pipe(
          map(([local, directory, google]) => {
            const all = [...local, ...directory, ...google];
            return this.deduplicateContacts(all);
          })
        );
      })
    );
  }

  /**
   * Clear the contacts cache to force a refresh
   */
  clearCache(): void {
    this.contactsCache$ = null;
  }

  private async fetchAppUsers(): Promise<UserProfile[]> {
    try {
      const usersRef = collection(this.firestore, 'users');
      // Simple query to get recent users or just all (assuming small team size for now)
      const q = query(usersRef, limit(100)); // Limit to prevent massive reads
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as UserProfile);
    } catch (e) {
      console.warn('Error fetching app users from Firestore:', e);
      return [];
    }
  }

  private mapUserToContact(user: UserProfile): Contact {
    return {
      id: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      source: 'app',
    };
  }

  private mapGoogleContactToContact(googleContact: GoogleContact): Contact {
    return {
      id: googleContact.id,
      email: googleContact.email,
      displayName: googleContact.displayName,
      photoURL: googleContact.photoURL,
      source: googleContact.source,
    };
  }

  /**
   * Deduplicate contacts by email, preferring app users over external sources
   */
  private deduplicateContacts(contacts: Contact[]): Contact[] {
    const contactMap = new Map<string, Contact>();
    
    // Priority order: app > google-directory > google-contacts > default-domain
    const sourcePriority: Record<Contact['source'], number> = {
      'app': 1,
      'google-directory': 2,
      'workspace': 3,
      'google-contacts': 4,
      'default-domain': 5,
    };

    for (const contact of contacts) {
      const key = contact.email.toLowerCase();
      const existing = contactMap.get(key);
      
      if (!existing || sourcePriority[contact.source] < sourcePriority[existing.source]) {
        contactMap.set(key, contact);
      }
    }

    // Sort by display name
    return Array.from(contactMap.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );
  }
}

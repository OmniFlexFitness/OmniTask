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
import { Observable, from, of, catchError, map, shareReplay } from 'rxjs';
import { UserProfile } from '../models/user.model';

export interface Contact {
  id: string; // email or uid
  email: string;
  displayName: string;
  photoURL?: string;
  source: 'workspace' | 'app';
}

@Injectable({
  providedIn: 'root',
})
export class ContactsService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);

  // Cache for contacts
  private contactsCache$: Observable<Contact[]> | null = null;

  /**
   * Get all available contacts (cached)
   * Tries to fetch from simple Firestore query of existing app users first
   * In future can be enhanced to call a Cloud Function for Directory API
   */
  getContacts(): Observable<Contact[]> {
    if (!this.contactsCache$) {
      this.contactsCache$ = from(this.fetchAppUsers()).pipe(
        map((users) => users.map((u) => this.mapUserToContact(u))),
        shareReplay(1),
        catchError((err) => {
          console.error('Failed to fetch contacts', err);
          return of([]);
        })
      );
    }
    return this.contactsCache$;
  }

  /**
   * Search contacts
   */
  searchContacts(queryStr: string): Observable<Contact[]> {
    if (!queryStr) return of([]);

    return this.getContacts().pipe(
      map((contacts) => {
        const q = queryStr.toLowerCase();
        return contacts.filter(
          (c) => c.displayName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
        );
      })
    );
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

  /**
   * Future implementation for Google Workspace Directory API
   */
  /*
  private async fetchDirectoryContacts(): Promise<Contact[]> {
    const getContacts = httpsCallable(this.functions, 'getWorkspaceContacts');
    const result = await getContacts({});
    return result.data as Contact[];
  }
  */
}

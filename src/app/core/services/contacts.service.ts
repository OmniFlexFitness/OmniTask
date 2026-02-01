import { Injectable, inject, signal } from '@angular/core';
import {
  Firestore,
  collection,
  query,
  limit,
  getDocs,
  where,
  orderBy,
  doc,
  setDoc,
  Timestamp,
  writeBatch,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import {
  Observable,
  from,
  of,
  catchError,
  map,
  shareReplay,
  combineLatest,
  forkJoin,
  switchMap,
  tap,
  BehaviorSubject,
  firstValueFrom,
} from 'rxjs';
import { UserProfile } from '../models/user.model';
import { GoogleContactsService, GoogleContact } from './google-contacts.service';
import { AuthService } from '../auth/auth.service';

export interface Contact {
  id: string; // email or uid
  email: string;
  displayName: string;
  photoURL?: string;
  source:
    | 'workspace'
    | 'google-contacts'
    | 'google-directory'
    | 'default-domain'
    | 'cached';
}

/**
 * Stored contact in Firestore
 */
interface StoredContact {
  email: string;
  displayName: string;
  photoURL?: string;
  source: string;
  updatedAt: Timestamp;
}

@Injectable({
  providedIn: 'root',
})
export class ContactsService {
  private readonly firestore = inject(Firestore);
  private readonly functions = inject(Functions);
  private readonly googleContactsService = inject(GoogleContactsService);
  private readonly authService = inject(AuthService);

  // Cache for contacts
  private contactsCache$: Observable<Contact[]> | null = null;

  // Loading state
  private readonly loadingSubject = new BehaviorSubject<boolean>(false);
  loading$ = this.loadingSubject.asObservable();

  // Default domain for omniflexfitness.com emails
  private readonly DEFAULT_DOMAIN = 'omniflexfitness.com';

  // Preset domain members for fallback when Google APIs unavailable
  // These are always included as lowest-priority options
  private readonly PRESET_DOMAIN_MEMBERS: Contact[] = [
    {
      id: 'bertin.kenol@omniflexfitness.com',
      email: 'bertin.kenol@omniflexfitness.com',
      displayName: 'Bertin Kenol',
      source: 'default-domain',
    },
    {
      id: 'team@omniflexfitness.com',
      email: 'team@omniflexfitness.com',
      displayName: 'Team',
      source: 'default-domain',
    },
    {
      id: 'admin@omniflexfitness.com',
      email: 'admin@omniflexfitness.com',
      displayName: 'Admin',
      source: 'default-domain',
    },
  ];

  /**
   * Get all available contacts (cached with background refresh)
   *
   * Flow:
   * 1. First, load from Firestore cache (fast)
   * 2. In background, fetch fresh from Google APIs
   * 3. Sync new contacts to Firestore
   * 4. Return deduplicated results
   */
  getContacts(): Observable<Contact[]> {
    if (!this.contactsCache$) {
      this.loadingSubject.next(true);

      this.contactsCache$ = combineLatest([
        // 1. Cached contacts from Firestore (fast, primary source, user-scoped)
        from(this.fetchCachedContacts()).pipe(
          tap((contacts) =>
            console.log('[ContactsService] Firestore cache:', contacts.length, 'contacts'),
          ),
          catchError((err) => {
            console.warn('Failed to fetch cached contacts:', err);
            return of([]);
          }),
        ),
        // 2. Google Directory people (domain users) - primary source for team contacts
        this.googleContactsService.getDirectoryPeople().pipe(
          tap((contacts) =>
            console.log('[ContactsService] Google Directory:', contacts.length, 'contacts'),
          ),
          map((contacts) => contacts.map((c) => this.mapGoogleContactToContact(c))),
          catchError((err) => {
            console.warn('[ContactsService] Google Directory failed:', err);
            return of([]);
          }),
        ),
        // 3. Google Contacts (personal contacts)
        this.googleContactsService.getContacts().pipe(
          tap((contacts) =>
            console.log('[ContactsService] Google Contacts:', contacts.length, 'contacts'),
          ),
          map((contacts) => contacts.map((c) => this.mapGoogleContactToContact(c))),
          catchError(() => of([])),
        ),
        // 4. Other contacts inferred from interactions
        this.googleContactsService.getOtherContacts().pipe(
          tap((contacts) =>
            console.log('[ContactsService] Google Other Contacts:', contacts.length, 'contacts'),
          ),
          map((contacts) => contacts.map((c) => this.mapGoogleContactToContact(c))),
          catchError((err) => {
            console.warn('[ContactsService] Google Other Contacts failed:', err);
            return of([]);
          }),
        ),
        // 5. Always include preset domain members as fallback
        of(this.PRESET_DOMAIN_MEMBERS),
      ]).pipe(
        map(
          ([
            cachedContacts,
            directoryPeople,
            googleContacts,
            otherContacts,
            presetMembers,
          ]) => {
            // Merge and deduplicate contacts by email
            // Priority: google-directory > google-contacts > other-contacts > cached > default-domain
            const allContacts = [
              ...directoryPeople,
              ...googleContacts,
              ...otherContacts,
              ...cachedContacts,
              ...presetMembers,
            ];
            return this.deduplicateContacts(allContacts);
          },
        ),
        tap((contacts) => {
          this.loadingSubject.next(false);
          // Sync fresh contacts to Firestore in background
          this.syncContactsToFirestore(contacts).catch((err) =>
            console.warn('Failed to sync contacts to Firestore:', err),
          );
        }),
        shareReplay(1),
        catchError((err) => {
          console.error('Failed to fetch contacts', err);
          this.loadingSubject.next(false);
          return of([]);
        }),
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
        contacts.filter((c) => c.email.toLowerCase().endsWith(`@${this.DEFAULT_DOMAIN}`)),
      ),
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
          (c) => c.displayName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
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
            catchError(() => of([])),
          ),
          this.googleContactsService.searchContacts(queryStr).pipe(
            map((contacts) => contacts.map((c) => this.mapGoogleContactToContact(c))),
            catchError(() => of([])),
          ),
        ]).pipe(
          map(([local, directory, google]) => {
            const all = [...local, ...directory, ...google];
            return this.deduplicateContacts(all);
          }),
        );
      }),
    );
  }

  /**
   * Clear the contacts cache to force a refresh
   */
  clearCache(): void {
    this.contactsCache$ = null;
  }

  /**
   * Fetch cached contacts from Firestore (user-scoped)
   */
  private async fetchCachedContacts(): Promise<Contact[]> {
    try {
      const currentUser = this.authService.currentUserSig();
      if (!currentUser?.uid) {
        console.log('No current user, skipping cached contacts fetch');
        return [];
      }

      const contactsRef = collection(this.firestore, `users/${currentUser.uid}/contacts`);
      const q = query(contactsRef, orderBy('displayName'), limit(500));
      const snap = await getDocs(q);

      return snap.docs.map((docSnap) => {
        const data = docSnap.data() as StoredContact;
        return {
          id: data.email,
          email: data.email,
          displayName: data.displayName,
          photoURL: data.photoURL,
          source: 'cached' as const,
        };
      });
    } catch (e) {
      console.warn('Error fetching cached contacts from Firestore:', e);
      return [];
    }
  }

  /**
   * Sync contacts to Firestore for caching (user-scoped)
   * Only writes contacts from Google APIs (not app users or presets)
   */
  private async syncContactsToFirestore(contacts: Contact[]): Promise<void> {
    // Only sync contacts from Google sources
    const contactsToSync = contacts.filter(
      (c) => c.source === 'google-directory' || c.source === 'google-contacts',
    );

    if (contactsToSync.length === 0) return;

    try {
      const currentUser = this.authService.currentUserSig();
      if (!currentUser?.uid) {
        console.log('No current user, skipping contacts sync');
        return;
      }

      const batch = writeBatch(this.firestore);
      const now = Timestamp.now();

      for (const contact of contactsToSync) {
        // Use email as document ID (sanitized for Firestore)
        const docId = this.sanitizeEmail(contact.email);
        const docRef = doc(this.firestore, `users/${currentUser.uid}/contacts`, docId);

        const storedContact: StoredContact = {
          email: contact.email,
          displayName: contact.displayName,
          photoURL: contact.photoURL,
          source: contact.source,
          updatedAt: now,
        };

        batch.set(docRef, storedContact, { merge: true });
      }

      await batch.commit();
      console.log(`Synced ${contactsToSync.length} contacts to Firestore (user-scoped)`);
    } catch (e) {
      console.error('Error syncing contacts to Firestore:', e);
      throw e;
    }
  }

  /**
   * Sanitize email for use as Firestore document ID
   */
  private sanitizeEmail(email: string): string {
    // Firestore document IDs cannot contain forward slashes
    return email.toLowerCase().replace(/\//g, '_');
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
   * Deduplicate contacts by email, preferring higher priority sources
   */
  private deduplicateContacts(contacts: Contact[]): Contact[] {
    const contactMap = new Map<string, Contact>();

    // Priority order: google-directory > google-contacts > workspace > cached > default-domain
    const sourcePriority: Record<Contact['source'], number> = {
      'google-directory': 1,
      'google-contacts': 2,
      workspace: 3,
      cached: 4,
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
      a.displayName.localeCompare(b.displayName),
    );
  }
}

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

export interface Contact {
  id: string; // email or uid
  email: string;
  displayName: string;
  photoURL?: string;
  source:
    | 'workspace'
    | 'app'
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

  // Cache for contacts
  private contactsCache$: Observable<Contact[]> | null = null;

  // Loading state
  private readonly loadingSubject = new BehaviorSubject<boolean>(false);
  loading$ = this.loadingSubject.asObservable();

  // Default domain for omniflexfitness.com emails
  private readonly DEFAULT_DOMAIN = 'omniflexfitness.com';

  // Firestore collection name for cached contacts
  private readonly CONTACTS_COLLECTION = 'contacts';

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
        // 1. Cached contacts from Firestore (fast, primary source)
        from(this.fetchCachedContacts()).pipe(
          tap((contacts) =>
            console.log('[ContactsService] Firestore cache:', contacts.length, 'contacts'),
          ),
          catchError((err) => {
            console.warn('Failed to fetch cached contacts:', err);
            return of([]);
          }),
        ),
        // 2. App users from Firestore users collection
        from(this.fetchAppUsers()).pipe(
          tap((users) => console.log('[ContactsService] App users:', users.length, 'users')),
          map((users) => users.map((u) => this.mapUserToContact(u))),
          catchError(() => of([])),
        ),
        // 3. Google Directory people (domain users)
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
        // 4. Google Contacts (personal contacts)
        this.googleContactsService.getContacts().pipe(
          tap((contacts) =>
            console.log('[ContactsService] Google Contacts:', contacts.length, 'contacts'),
          ),
          map((contacts) => contacts.map((c) => this.mapGoogleContactToContact(c))),
          catchError(() => of([])),
        ),
        // 5. Other contacts inferred from interactions
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
        // 6. Always include preset domain members as fallback
        of(this.PRESET_DOMAIN_MEMBERS),
      ]).pipe(
        map(
          ([
            cachedContacts,
            appUsers,
            directoryPeople,
            googleContacts,
            otherContacts,
            presetMembers,
          ]) => {
            // Merge and deduplicate contacts by email
            // Priority: app > google-directory > google-contacts > cached > default-domain
            const allContacts = [
              ...appUsers,
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
   * Fetch cached contacts from Firestore
   */
  private async fetchCachedContacts(): Promise<Contact[]> {
    try {
      const contactsRef = collection(this.firestore, this.CONTACTS_COLLECTION);
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
   * Sync contacts to Firestore for caching
   * Only writes contacts from Google APIs (not app users or presets)
   */
  private async syncContactsToFirestore(contacts: Contact[]): Promise<void> {
    // Only sync contacts from Google sources
    const contactsToSync = contacts.filter(
      (c) => c.source === 'google-directory' || c.source === 'google-contacts',
    );

    if (contactsToSync.length === 0) return;

    try {
      const batch = writeBatch(this.firestore);
      const now = Timestamp.now();

      for (const contact of contactsToSync) {
        // Use email as document ID (sanitized for Firestore)
        const docId = this.sanitizeEmail(contact.email);
        const docRef = doc(this.firestore, this.CONTACTS_COLLECTION, docId);

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
      console.log(`Synced ${contactsToSync.length} contacts to Firestore`);
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

    // Priority order: app > google-directory > google-contacts > cached > default-domain
    const sourcePriority: Record<Contact['source'], number> = {
      app: 1,
      'google-directory': 2,
      'google-contacts': 3,
      workspace: 4,
      cached: 5,
      'default-domain': 6,
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

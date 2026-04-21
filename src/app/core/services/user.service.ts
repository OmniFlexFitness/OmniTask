import { Injectable, inject, signal, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  updateDoc,
  query,
  where,
  collectionData,
} from '@angular/fire/firestore';
import {
  DEFAULT_USER_PERMISSIONS,
  UserPermissions,
  UserProfile,
  resolvePermissions,
} from '../models/user.model';
import { Observable, from, of } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private usersCollection = collection(this.firestore, 'users');

  loading = signal(false);
  error = signal<string | null>(null);

  /**
   * Get all users.
   * NOTE: Only works if the user has read access to all users (e.g., is an admin).
   */
  getAllUsers(): Observable<UserProfile[]> {
    const q = query(this.usersCollection);
    return runInInjectionContext(this.injector, () => {
      return collectionData(q, { idField: 'uid' }) as Observable<UserProfile[]>;
    });
  }

  /**
   * Update a user's role.
   */
  async updateUserRole(uid: string, role: 'admin' | 'user'): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const userRef = doc(this.firestore, 'users', uid);
      await updateDoc(userRef, { role });
    } catch (err) {
      const message = 'Failed to update user role';
      console.error(`${message}:`, err);
      this.error.set(message);
      throw err;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Replace a user's permissions map. Any field not supplied falls back to
   * the default permission value so the stored document is always fully
   * populated and predictable for Firestore rules.
   */
  async updateUserPermissions(
    uid: string,
    permissions: Partial<UserPermissions>,
  ): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const merged: UserPermissions = { ...DEFAULT_USER_PERMISSIONS, ...permissions };
      const userRef = doc(this.firestore, 'users', uid);
      await updateDoc(userRef, { permissions: merged });
    } catch (err) {
      const message = 'Failed to update user permissions';
      console.error(`${message}:`, err);
      this.error.set(message);
      throw err;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Read a single user profile by UID. Returns null if the document doesn't
   * exist or the current user lacks read permission (Firestore rules only
   * permit reading own profile unless the reader is an admin).
   */
  async getUserById(uid: string): Promise<UserProfile | null> {
    if (!uid) return null;
    try {
      const ref = doc(this.firestore, `users/${uid}`);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      return { ...(snap.data() as UserProfile), uid };
    } catch (err) {
      // Read can fail when the requesting user isn't authorized to read this
      // profile. That's expected for non-admins fetching arbitrary users; we
      // surface it as "unknown user" at the UI layer.
      console.warn('getUserById failed:', err);
      return null;
    }
  }

  /**
   * Resolve the list of UIDs a user sees as "people I report to". For now
   * this is just the single `reportsToId` if set, expanded to its profile.
   */
  async getReportsTo(user: UserProfile | null): Promise<UserProfile | null> {
    if (!user?.reportsToId) return null;
    return this.getUserById(user.reportsToId);
  }

  /**
   * Set the user's `reportsToId` link (direct manager). Caches display name
   * and email on the user's own doc so UI can render the badge without a
   * second read (and so it still renders when the manager's profile is not
   * readable to this user due to Firestore rules).
   */
  async setReportsTo(uid: string, manager: UserProfile | null): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);
    if (!manager) {
      await updateDoc(userRef, {
        reportsToId: null,
        reportsToName: null,
        reportsToEmail: null,
      });
      return;
    }
    await updateDoc(userRef, {
      reportsToId: manager.uid,
      reportsToName: manager.displayName || manager.email || manager.uid,
      reportsToEmail: manager.email ?? null,
    });
  }

  /**
   * Toggle a single permission flag on a user document. The rest of the
   * permission map is preserved.
   */
  async setUserPermission(
    user: UserProfile,
    key: keyof UserPermissions,
    value: boolean,
  ): Promise<void> {
    const current = resolvePermissions(user);
    current[key] = value;
    return this.updateUserPermissions(user.uid, current);
  }
}

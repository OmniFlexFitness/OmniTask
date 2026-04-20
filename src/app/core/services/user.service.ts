import { Injectable, inject, signal, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  updateDoc,
  query,
  collectionData,
} from '@angular/fire/firestore';
import { DEFAULT_USER_PERMISSIONS, UserPermissions, UserProfile } from '../models/user.model';
import { Observable } from 'rxjs';

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
   * Toggle a single permission flag on a user document. The rest of the
   * permission map is preserved.
   */
  async setUserPermission(
    user: UserProfile,
    key: keyof UserPermissions,
    value: boolean,
  ): Promise<void> {
    const current: UserPermissions = { ...DEFAULT_USER_PERMISSIONS, ...(user.permissions ?? {}) };
    current[key] = value;
    return this.updateUserPermissions(user.uid, current);
  }
}

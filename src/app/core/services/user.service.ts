import { Injectable, inject, signal, Injector, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  updateDoc,
  query,
  collectionData,
} from '@angular/fire/firestore';
import { UserProfile } from '../models/user.model';
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
      const userRef = doc(this.firestore, `users/${uid}`);
      await updateDoc(userRef, { role });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update user role';
      this.error.set(message);
      throw err;
    } finally {
      this.loading.set(false);
    }
  }
}

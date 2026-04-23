import { Injectable, inject, signal } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  collectionData,
  orderBy,
  query,
  Timestamp,
} from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { CustomFieldDefinition } from '../models/domain.model';

@Injectable({ providedIn: 'root' })
export class CustomFieldService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  loading = signal(false);
  error = signal<string | null>(null);

  /**
   * Returns a real-time observable of the user's global custom fields.
   */
  getCustomFields(): Observable<CustomFieldDefinition[]> {
    const uid = this.auth.currentUserSig()?.uid;
    if (!uid) return of([]);

    const fieldsCol = collection(this.firestore, `users/${uid}/customFields`);
    const q = query(fieldsCol, orderBy('createdAt', 'desc'));

    return collectionData(q, { idField: 'id' }) as Observable<CustomFieldDefinition[]>;
  }

  /**
   * Creates a new custom field definition in the user's global library.
   */
  async createCustomField(
    data: Omit<CustomFieldDefinition, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  ): Promise<string | null> {
    const uid = this.auth.currentUserSig()?.uid;
    if (!uid) return null;

    try {
      this.loading.set(true);
      const fieldsCol = collection(this.firestore, `users/${uid}/customFields`);
      const payload = {
        ...data,
        userId: uid,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const docRef = await addDoc(fieldsCol, payload);
      this.error.set(null);
      return docRef.id;
    } catch (err: any) {
      console.error('Failed to create custom field:', err);
      this.error.set(err.message || 'Failed to create field');
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Updates an existing custom field definition.
   */
  async updateCustomField(
    fieldId: string,
    data: Partial<Omit<CustomFieldDefinition, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<void> {
    const uid = this.auth.currentUserSig()?.uid;
    if (!uid) return;

    try {
      this.loading.set(true);
      const fieldDoc = doc(this.firestore, `users/${uid}/customFields/${fieldId}`);
      await updateDoc(fieldDoc, {
        ...data,
        updatedAt: Timestamp.now(),
      });
      this.error.set(null);
    } catch (err: any) {
      console.error('Failed to update custom field:', err);
      this.error.set(err.message || 'Failed to update field');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Deletes a custom field definition from the user's library entirely.
   */
  async deleteCustomField(fieldId: string): Promise<void> {
    const uid = this.auth.currentUserSig()?.uid;
    if (!uid) return;

    try {
      this.loading.set(true);
      const fieldDoc = doc(this.firestore, `users/${uid}/customFields/${fieldId}`);
      await deleteDoc(fieldDoc);
      this.error.set(null);
    } catch (err: any) {
      console.error('Failed to delete custom field:', err);
      this.error.set(err.message || 'Failed to delete field');
    } finally {
      this.loading.set(false);
    }
  }
}

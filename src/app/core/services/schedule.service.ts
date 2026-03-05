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
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { RecurringTask, WeeklyBlock } from '../models/domain.model';

/**
 * Service for managing daily recurring tasks and weekly schedule blocks.
 * Data is stored in per-user Firestore subcollections.
 */
@Injectable({ providedIn: 'root' })
export class ScheduleService {
  private firestore = inject(Firestore);
  private auth = inject(AuthService);

  loading = signal(false);
  error = signal<string | null>(null);

  // ──────────────────────────────────────────────
  // Recurring Tasks (Daily)
  // ──────────────────────────────────────────────

  private recurringTasksCol() {
    const uid = this.auth.currentUserSig()?.uid;
    if (!uid) return null;
    return collection(this.firestore, `users/${uid}/recurringTasks`);
  }

  /** Real-time observable of all recurring tasks, ordered by time */
  getRecurringTasks(): Observable<RecurringTask[]> {
    const col = this.recurringTasksCol();
    if (!col) return of([]);
    const q = query(col, orderBy('time', 'asc'));
    return collectionData(q, { idField: 'id' }) as Observable<RecurringTask[]>;
  }

  async createRecurringTask(
    data: Omit<RecurringTask, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  ): Promise<void> {
    const col = this.recurringTasksCol();
    if (!col) return;
    try {
      this.loading.set(true);
      await addDoc(col, {
        ...data,
        userId: this.auth.currentUserSig()!.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create recurring task';
      this.error.set(msg);
      console.error('[ScheduleService] createRecurringTask error:', err);
    } finally {
      this.loading.set(false);
    }
  }

  async updateRecurringTask(id: string, data: Partial<RecurringTask>): Promise<void> {
    const uid = this.auth.currentUserSig()?.uid;
    if (!uid) return;
    try {
      this.loading.set(true);
      const ref = doc(this.firestore, `users/${uid}/recurringTasks/${id}`);
      await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update recurring task';
      this.error.set(msg);
      console.error('[ScheduleService] updateRecurringTask error:', err);
    } finally {
      this.loading.set(false);
    }
  }

  async deleteRecurringTask(id: string): Promise<void> {
    const uid = this.auth.currentUserSig()?.uid;
    if (!uid) return;
    try {
      this.loading.set(true);
      const ref = doc(this.firestore, `users/${uid}/recurringTasks/${id}`);
      await deleteDoc(ref);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete recurring task';
      this.error.set(msg);
      console.error('[ScheduleService] deleteRecurringTask error:', err);
    } finally {
      this.loading.set(false);
    }
  }

  // ──────────────────────────────────────────────
  // Weekly Blocks
  // ──────────────────────────────────────────────

  private weeklyBlocksCol() {
    const uid = this.auth.currentUserSig()?.uid;
    if (!uid) return null;
    return collection(this.firestore, `users/${uid}/weeklyBlocks`);
  }

  /** Real-time observable of all weekly blocks */
  getWeeklyBlocks(): Observable<WeeklyBlock[]> {
    const col = this.weeklyBlocksCol();
    if (!col) return of([]);
    const q = query(col, orderBy('dayOfWeek', 'asc'));
    return collectionData(q, { idField: 'id' }) as Observable<WeeklyBlock[]>;
  }

  async createWeeklyBlock(
    data: Omit<WeeklyBlock, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  ): Promise<void> {
    const col = this.weeklyBlocksCol();
    if (!col) return;
    try {
      this.loading.set(true);
      await addDoc(col, {
        ...data,
        userId: this.auth.currentUserSig()!.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create weekly block';
      this.error.set(msg);
      console.error('[ScheduleService] createWeeklyBlock error:', err);
    } finally {
      this.loading.set(false);
    }
  }

  async updateWeeklyBlock(id: string, data: Partial<WeeklyBlock>): Promise<void> {
    const uid = this.auth.currentUserSig()?.uid;
    if (!uid) return;
    try {
      this.loading.set(true);
      const ref = doc(this.firestore, `users/${uid}/weeklyBlocks/${id}`);
      await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update weekly block';
      this.error.set(msg);
      console.error('[ScheduleService] updateWeeklyBlock error:', err);
    } finally {
      this.loading.set(false);
    }
  }

  async deleteWeeklyBlock(id: string): Promise<void> {
    const uid = this.auth.currentUserSig()?.uid;
    if (!uid) return;
    try {
      this.loading.set(true);
      const ref = doc(this.firestore, `users/${uid}/weeklyBlocks/${id}`);
      await deleteDoc(ref);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete weekly block';
      this.error.set(msg);
      console.error('[ScheduleService] deleteWeeklyBlock error:', err);
    } finally {
      this.loading.set(false);
    }
  }
}

import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  doc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import { GoogleCalendarService, GoogleCalendarEvent } from './google-calendar.service';
import { AuthService } from '../auth/auth.service';
import { Task } from '../models/domain.model';

const OMNITASK_ID_KEY = 'omniTaskId';

/** Format a local date as YYYY-MM-DD for all-day Calendar events. */
function toDateOnlyString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function firestoreDueDate(value: Task['dueDate']): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

@Injectable({
  providedIn: 'root',
})
export class GoogleCalendarSyncService {
  private readonly firestore = inject(Firestore);
  private readonly calendarService = inject(GoogleCalendarService);
  private readonly authService = inject(AuthService);
  private readonly tasksCollection = collection(this.firestore, 'tasks');

  /** Map a task due date to an all-day Calendar event (exclusive end date +1 day). */
  taskToCalendarEvent(task: Task): GoogleCalendarEvent {
    const event: GoogleCalendarEvent = {
      summary: task.title,
      description: task.description ?? '',
      extendedProperties: {
        private: { [OMNITASK_ID_KEY]: task.id },
      },
    };

    const due = firestoreDueDate(task.dueDate);
    if (due) {
      const start = toDateOnlyString(due);
      const endDate = new Date(due);
      endDate.setDate(endDate.getDate() + 1);
      event.start = { date: start };
      event.end = { date: toDateOnlyString(endDate) };
    }

    return event;
  }

  calendarEventDueDate(event: Pick<GoogleCalendarEvent, 'start'>): Date | null {
    const dateStr = event.start?.date;
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  private resolveCalendarId(preferred?: string | null): string {
    const user = this.authService.currentUserSig() as any;
    return preferred ?? user?.googleCalendarId ?? 'primary';
  }

  private isSyncEnabled(): boolean {
    return !!(this.authService.currentUserSig() as any)?.googleCalendarSyncEnabled;
  }

  async syncTaskOutbound(task: Task): Promise<void> {
    if (!this.isSyncEnabled() || !this.calendarService.isAuthenticated()) return;

    const due = firestoreDueDate(task.dueDate);
    if (!due) {
      await this.deleteTaskFromCalendar(task);
      return;
    }

    const calendarId = this.resolveCalendarId(task.googleCalendarId);
    const payload = this.taskToCalendarEvent(task);

    try {
      if (task.googleCalendarEventId) {
        await firstValueFrom(
          this.calendarService.updateEvent(calendarId, task.googleCalendarEventId, payload),
        );
        return;
      }

      const created = await firstValueFrom(
        this.calendarService.createEvent(calendarId, payload),
      );
      if (!created.id) return;

      await updateDoc(doc(this.tasksCollection, task.id), {
        googleCalendarId: calendarId,
        googleCalendarEventId: created.id,
        isGoogleCalendarEvent: true,
      });
    } catch (err) {
      console.warn('Google Calendar outbound sync failed:', err);
    }
  }

  async pushAllDueTasks(): Promise<{ pushed: number }> {
    if (!this.isSyncEnabled() || !this.calendarService.isAuthenticated()) {
      return { pushed: 0 };
    }

    const uid = this.authService.currentUserSig()?.uid;
    if (!uid) return { pushed: 0 };

    const snap = await getDocs(
      query(this.tasksCollection, where('assigneeIds', 'array-contains', uid)),
    );
    let pushed = 0;
    for (const docSnap of snap.docs) {
      const task = { id: docSnap.id, ...docSnap.data() } as Task;
      if (!firestoreDueDate(task.dueDate)) continue;
      await this.syncTaskOutbound(task);
      pushed++;
    }

    await this.authService.updateProfile({
      lastCalendarSyncAt: new Date(),
      calendarSyncStatus: 'synced',
    } as any);

    return { pushed };
  }

  async pullFromCalendar(): Promise<{ updated: number }> {
    if (!this.isSyncEnabled() || !this.calendarService.isAuthenticated()) {
      return { updated: 0 };
    }

    const calendarId = this.resolveCalendarId();
    const response = await firstValueFrom(this.calendarService.listEvents(calendarId));
    let updated = 0;

    for (const event of response.items ?? []) {
      const taskId = event.extendedProperties?.private?.[OMNITASK_ID_KEY];
      if (!taskId || event.status === 'cancelled') continue;

      const due = this.calendarEventDueDate(event);
      if (!due) continue;

      await updateDoc(doc(this.tasksCollection, taskId), {
        dueDate: due,
        googleCalendarId: calendarId,
        googleCalendarEventId: event.id ?? null,
        isGoogleCalendarEvent: true,
        updatedAt: new Date(),
      });
      updated++;
    }

    await this.authService.updateProfile({
      lastCalendarSyncAt: new Date(),
      calendarSyncStatus: 'synced',
    } as any);

    return { updated };
  }

  async deleteTaskFromCalendar(task: Task): Promise<void> {
    if (!this.calendarService.isAuthenticated() || !task.googleCalendarEventId) return;

    const calendarId = this.resolveCalendarId(task.googleCalendarId);
    try {
      await firstValueFrom(
        this.calendarService.deleteEvent(calendarId, task.googleCalendarEventId),
      );
      await updateDoc(doc(this.tasksCollection, task.id), {
        googleCalendarEventId: null,
        isGoogleCalendarEvent: false,
      });
    } catch (err) {
      console.warn('Google Calendar delete failed:', err);
    }
  }
}

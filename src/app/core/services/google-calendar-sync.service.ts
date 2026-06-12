import { Injectable, inject } from '@angular/core';
import { Firestore, doc, updateDoc, collection } from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import { GoogleCalendarService, GoogleCalendarEvent } from './google-calendar.service';
import { Task } from '../models/domain.model';

/**
 * Mirrors task due dates to Google Calendar events. Scaffold only — wire into
 * TaskService once users re-consent with the calendar.events scope.
 */
@Injectable({
  providedIn: 'root',
})
export class GoogleCalendarSyncService {
  private readonly firestore = inject(Firestore);
  private readonly calendarService = inject(GoogleCalendarService);
  private readonly tasksCollection = collection(this.firestore, 'tasks');

  /** Default calendar id when none is configured on the task/project. */
  private static readonly PRIMARY_CALENDAR = 'primary';

  toCalendarEvent(task: Partial<Task>): GoogleCalendarEvent {
    const event: GoogleCalendarEvent = {
      summary: task.title ?? 'Untitled task',
      description: task.description ?? '',
    };

    if (task.dueDate) {
      const due =
        task.dueDate instanceof Date
          ? task.dueDate
          : typeof task.dueDate === 'object' && 'toDate' in task.dueDate
            ? (task.dueDate as { toDate: () => Date }).toDate()
            : null;
      if (due) {
        event.start = { dateTime: due.toISOString() };
        const end = new Date(due.getTime() + 30 * 60 * 1000);
        event.end = { dateTime: end.toISOString() };
      }
    }

    return event;
  }

  async pushTaskToCalendar(
    task: Task,
    calendarId?: string,
  ): Promise<{ calendarId: string; eventId: string } | null> {
    if (!this.calendarService.isAuthenticated()) return null;
    if (!task.dueDate) return null;

    const targetCalendarId = calendarId ?? task.googleCalendarId ?? GoogleCalendarSyncService.PRIMARY_CALENDAR;
    const payload = this.toCalendarEvent(task);

    if (task.googleCalendarEventId) {
      const updated = await firstValueFrom(
        this.calendarService.updateEvent(targetCalendarId, task.googleCalendarEventId, payload),
      );
      return updated.id ? { calendarId: targetCalendarId, eventId: updated.id } : null;
    }

    const created = await firstValueFrom(
      this.calendarService.createEvent(targetCalendarId, payload),
    );
    if (!created.id) return null;

    await updateDoc(doc(this.tasksCollection, task.id), {
      googleCalendarId: targetCalendarId,
      googleCalendarEventId: created.id,
      isGoogleCalendarEvent: true,
    });

    return { calendarId: targetCalendarId, eventId: created.id };
  }

  async deleteCalendarEvent(task: Task, calendarId?: string): Promise<void> {
    if (!this.calendarService.isAuthenticated()) return;
    if (!task.googleCalendarEventId) return;

    const targetCalendarId =
      calendarId ?? task.googleCalendarId ?? GoogleCalendarSyncService.PRIMARY_CALENDAR;
    try {
      await firstValueFrom(
        this.calendarService.deleteEvent(targetCalendarId, task.googleCalendarEventId),
      );
    } catch (err) {
      console.warn('Google Calendar delete failed:', err);
    }
  }
}

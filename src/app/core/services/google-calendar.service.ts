import { Injectable, inject, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';

/** Google Calendar API event (subset). */
export interface GoogleCalendarEvent {
  id?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  status?: 'confirmed' | 'tentative' | 'cancelled';
  updated?: string;
}

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
}

export interface GoogleCalendarListResponse {
  items?: GoogleCalendarListEntry[];
}

@Injectable({
  providedIn: 'root',
})
export class GoogleCalendarService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly API_BASE_URL = 'https://www.googleapis.com/calendar/v3';

  /** Reuses the shared Google OAuth access token (same as Tasks/Sheets). */
  isAuthenticated = computed(() => !!this.authService.googleTasksAccessToken());

  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.googleTasksAccessToken();
    if (!token) {
      throw new Error('Google Calendar not authenticated. Reconnect Google to grant calendar access.');
    }
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
  }

  listCalendars(): Observable<GoogleCalendarListResponse> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Google Calendar not authenticated'));
    }
    return this.http.get<GoogleCalendarListResponse>(`${this.API_BASE_URL}/users/me/calendarList`, {
      headers: this.getAuthHeaders(),
    });
  }

  getEvent(calendarId: string, eventId: string): Observable<GoogleCalendarEvent> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Google Calendar not authenticated'));
    }
    const encodedCalendar = encodeURIComponent(calendarId);
    return this.http.get<GoogleCalendarEvent>(
      `${this.API_BASE_URL}/calendars/${encodedCalendar}/events/${eventId}`,
      { headers: this.getAuthHeaders() },
    );
  }

  createEvent(calendarId: string, event: GoogleCalendarEvent): Observable<GoogleCalendarEvent> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Google Calendar not authenticated'));
    }
    const encodedCalendar = encodeURIComponent(calendarId);
    return this.http.post<GoogleCalendarEvent>(
      `${this.API_BASE_URL}/calendars/${encodedCalendar}/events`,
      event,
      { headers: this.getAuthHeaders() },
    );
  }

  updateEvent(
    calendarId: string,
    eventId: string,
    event: GoogleCalendarEvent,
  ): Observable<GoogleCalendarEvent> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Google Calendar not authenticated'));
    }
    const encodedCalendar = encodeURIComponent(calendarId);
    return this.http.patch<GoogleCalendarEvent>(
      `${this.API_BASE_URL}/calendars/${encodedCalendar}/events/${eventId}`,
      event,
      { headers: this.getAuthHeaders() },
    );
  }

  deleteEvent(calendarId: string, eventId: string): Observable<void> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Google Calendar not authenticated'));
    }
    const encodedCalendar = encodeURIComponent(calendarId);
    return this.http.delete<void>(
      `${this.API_BASE_URL}/calendars/${encodedCalendar}/events/${eventId}`,
      { headers: this.getAuthHeaders() },
    );
  }
}

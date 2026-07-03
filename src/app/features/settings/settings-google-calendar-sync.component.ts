import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { DialogService } from '../../core/services/dialog.service';
import {
  GoogleCalendarService,
  GoogleCalendarListEntry,
} from '../../core/services/google-calendar.service';
import { GoogleCalendarSyncService } from '../../core/services/google-calendar-sync.service';

@Component({
  selector: 'app-settings-google-calendar-sync',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './settings-google-calendar-sync.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsGoogleCalendarSyncComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly dialogService = inject(DialogService);
  private readonly calendarService = inject(GoogleCalendarService);
  private readonly calendarSyncService = inject(GoogleCalendarSyncService);
  private readonly router = inject(Router);

  currentUser = this.authService.currentUserSig as unknown as () => any;

  calendarAuthenticated = computed(() => this.calendarService.isAuthenticated());
  syncEnabled = computed(() => !!this.currentUser()?.googleCalendarSyncEnabled);
  selectedCalendarId = computed(() => this.currentUser()?.googleCalendarId || 'primary');

  calendars = signal<GoogleCalendarListEntry[]>([]);
  loadingCalendars = signal(false);
  syncing = signal(false);
  lastSyncResult = signal<{ success: boolean; message: string } | null>(null);
  enablingOffline = signal(false);

  hasOfflineAccess = computed(() => this.authService.hasOfflineAccess());

  ngOnInit(): void {
    if (this.calendarAuthenticated()) {
      void this.loadCalendars();
    }
  }

  async loadCalendars(): Promise<void> {
    if (!this.calendarAuthenticated()) return;
    this.loadingCalendars.set(true);
    try {
      const response = await firstValueFrom(this.calendarService.listCalendars());
      this.calendars.set(response.items ?? []);
    } catch (err) {
      console.error('Failed to load calendars:', err);
      this.calendars.set([]);
    } finally {
      this.loadingCalendars.set(false);
    }
  }

  async toggleSyncEnabled(): Promise<void> {
    const next = !this.syncEnabled();
    try {
      await this.authService.updateProfile({
        googleCalendarSyncEnabled: next,
        calendarSyncStatus: next ? 'pending' : undefined,
      } as any);
      if (next && this.calendarAuthenticated()) {
        await this.loadCalendars();
      }
    } catch (err) {
      console.error('Failed to toggle calendar sync:', err);
    }
  }

  async selectCalendar(calendarId: string): Promise<void> {
    try {
      await this.authService.updateProfile({
        googleCalendarId: calendarId,
        calendarSyncStatus: 'pending',
      } as any);
    } catch (err) {
      console.error('Failed to select calendar:', err);
    }
  }

  async triggerPullSync(): Promise<void> {
    this.syncing.set(true);
    try {
      const result = await this.calendarSyncService.pullFromCalendar();
      this.lastSyncResult.set({
        success: true,
        message: `Pulled ${result.updated} due date update(s) from Google Calendar`,
      });
    } catch (err) {
      console.error('Calendar pull failed:', err);
      await this.authService.updateProfile({ calendarSyncStatus: 'error' } as any);
      this.lastSyncResult.set({
        success: false,
        message: 'Calendar sync failed. Reconnect Google and try again.',
      });
    } finally {
      this.syncing.set(false);
      setTimeout(() => this.lastSyncResult.set(null), 6000);
    }
  }

  async triggerPushSync(): Promise<void> {
    this.syncing.set(true);
    try {
      const result = await this.calendarSyncService.pushAllDueTasks();
      this.lastSyncResult.set({
        success: true,
        message: `Pushed ${result.pushed} task(s) to Google Calendar`,
      });
    } catch (err) {
      console.error('Calendar push failed:', err);
      this.lastSyncResult.set({
        success: false,
        message: 'Failed to push tasks to Google Calendar.',
      });
    } finally {
      this.syncing.set(false);
      setTimeout(() => this.lastSyncResult.set(null), 6000);
    }
  }

  formatSyncDate(date: Date | { toDate: () => Date } | null | undefined): string {
    if (!date) return 'Never';
    const d = date instanceof Date ? date : date.toDate?.() ?? new Date();
    return d.toLocaleString();
  }

  async reconnectGoogle(): Promise<void> {
    await this.authService.logout();
  }

  async enableOfflineAccess(): Promise<void> {
    this.enablingOffline.set(true);
    try {
      await this.authService.requestOfflineAccess(this.router.url);
    } catch (err) {
      console.error('Failed to request offline access:', err);
      this.enablingOffline.set(false);
    }
  }

  async disableOfflineAccess(): Promise<void> {
    const confirmed = await this.dialogService.confirm(
      'Disable background Google access? Scheduled sync and token refresh will stop until you reconnect.',
      'Disable offline access',
    );
    if (!confirmed) return;
    try {
      await this.authService.revokeOfflineAccess();
      this.lastSyncResult.set({ success: true, message: 'Offline Google access revoked.' });
    } catch (err) {
      console.error('Failed to revoke offline access:', err);
    }
  }
}

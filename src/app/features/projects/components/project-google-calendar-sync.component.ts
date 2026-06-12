import {
  Component,
  input,
  output,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ProjectService } from '../../../core/services/project.service';
import { AuthService } from '../../../core/auth/auth.service';
import {
  GoogleCalendarService,
  GoogleCalendarListEntry,
} from '../../../core/services/google-calendar.service';
import { Project } from '../../../core/models/domain.model';

@Component({
  selector: 'app-project-google-calendar-sync',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './project-google-calendar-sync.component.html',
  styleUrls: ['./project-google-calendar-sync.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectGoogleCalendarSyncComponent implements OnInit {
  private readonly projectService = inject(ProjectService);
  private readonly calendarService = inject(GoogleCalendarService);
  private readonly authService = inject(AuthService);

  project = input.required<Project>();
  projectChanged = output<void>();

  calendarAuthenticated = computed(() => this.calendarService.isAuthenticated());
  calendars = signal<GoogleCalendarListEntry[]>([]);
  loadingCalendars = signal(false);
  showCalendarSelector = signal(false);

  currentCalendarName = computed(() => {
    const id = this.project().googleCalendarId;
    if (!id) return null;
    const cal = this.calendars().find((c) => c.id === id);
    return cal?.summary ?? (id === 'primary' ? 'Primary calendar' : id);
  });

  ngOnInit(): void {
    if (this.calendarAuthenticated()) {
      void this.loadCalendars();
    }
  }

  async reconnectGoogle(): Promise<void> {
    await this.authService.logout();
  }

  async toggleSyncEnabled(): Promise<void> {
    const newValue = !this.project().calendarSyncEnabled;
    const updateData: Record<string, unknown> = { calendarSyncEnabled: newValue };
    if (newValue) {
      updateData['calendarSyncStatus'] = 'pending';
    } else {
      updateData['calendarSyncStatus'] = null;
      updateData['googleCalendarId'] = null;
    }
    await this.projectService.updateProject(this.project().id, updateData);
    this.projectChanged.emit();
    if (newValue && this.calendarAuthenticated()) {
      await this.loadCalendars();
    }
  }

  async loadCalendars(): Promise<void> {
    if (!this.calendarAuthenticated()) return;
    this.loadingCalendars.set(true);
    try {
      const response = await firstValueFrom(this.calendarService.listCalendars());
      this.calendars.set(response.items ?? []);
    } catch (err) {
      console.error('Failed to load Google calendars:', err);
      this.calendars.set([]);
    } finally {
      this.loadingCalendars.set(false);
    }
  }

  async selectCalendar(calendarId: string): Promise<void> {
    await this.projectService.updateProject(this.project().id, {
      googleCalendarId: calendarId,
      calendarSyncEnabled: true,
      calendarSyncStatus: 'pending',
    });
    this.projectChanged.emit();
    this.showCalendarSelector.set(false);
  }

  formatSyncDate(date: Date | { toDate: () => Date } | null | undefined): string {
    if (!date) return 'Never';
    const d =
      date instanceof Date ? date : ((date as { toDate?: () => Date }).toDate?.() ?? new Date());
    return d.toLocaleString();
  }
}

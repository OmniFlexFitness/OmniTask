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
import { DialogService } from '../../../core/services/dialog.service';
import { AuthService } from '../../../core/auth/auth.service';
import {
  GoogleTasksService,
  GoogleTaskList,
  GoogleTask,
} from '../../../core/services/google-tasks.service';
import { GoogleTasksSyncService } from '../../../core/services/google-tasks-sync.service';
import { Project } from '../../../core/models/domain.model';

@Component({
  selector: 'app-project-google-tasks-sync',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './project-google-tasks-sync.component.html',
  styleUrls: ['./project-google-tasks-sync.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectGoogleTasksSyncComponent implements OnInit {
  private readonly projectService = inject(ProjectService);
  private readonly dialogService = inject(DialogService);
  private readonly googleTasksService = inject(GoogleTasksService);
  private readonly googleTasksSyncService = inject(GoogleTasksSyncService);
  private readonly authService = inject(AuthService);

  project = input.required<Project>();
  projectChanged = output<void>();

  // Google Tasks state
  googleTasksAuthenticated = computed(() => this.googleTasksService.isAuthenticated());
  googleTaskLists = signal<GoogleTaskList[]>([]);
  loadingTaskLists = signal(false);
  syncing = signal(false);
  lastSyncResult = signal<{ success: boolean; message: string } | null>(null);
  showListSelector = signal(false); // Control dropdown visibility

  // Preview state
  showTaskPreview = signal(false);
  loadingPreview = signal(false);
  previewTasks = signal<GoogleTask[]>([]);
  previewingListId = signal<string | null>(null); // Which list is being previewed
  previewingListName = signal<string | null>(null); // Name of list being previewed

  // Scheduled sync state
  hasOfflineAccess = computed(() => this.authService.hasOfflineAccess());
  enablingScheduledSync = signal(false);

  // Computed: Get current linked list name
  currentLinkedListName = computed(() => {
    const listId = this.project().googleTaskListId;
    if (!listId) return null;
    const list = this.googleTaskLists().find((l) => l.id === listId);
    return list?.title || 'Unknown List';
  });

  ngOnInit() {
    // Load task lists if sync is already enabled
    this.initGoogleTaskLists();
  }

  private async initGoogleTaskLists() {
    // Always load task lists when authenticated, so user can select one
    if (this.googleTasksAuthenticated()) {
      await this.loadGoogleTaskLists();
    }
  }

  async toggleSyncEnabled() {
    const newValue = !this.project().syncEnabled;
    try {
      // Build update object without undefined values (Firestore rejects undefined)
      const updateData: Record<string, any> = { syncEnabled: newValue };
      if (newValue) {
        updateData['syncStatus'] = 'pending';
      } else {
        updateData['syncStatus'] = null;
        updateData['googleTaskListId'] = null;
      }

      await this.projectService.updateProject(this.project().id, updateData);
      this.projectChanged.emit();

      // Load task lists when enabling sync
      if (newValue && this.googleTasksAuthenticated()) {
        await this.loadGoogleTaskLists();
      }
    } catch (error) {
      console.error('Failed to toggle sync:', error);
    }
  }

  async loadGoogleTaskLists() {
    if (!this.googleTasksAuthenticated()) return;

    this.loadingTaskLists.set(true);
    try {
      const response = await firstValueFrom(this.googleTasksService.getTaskLists());
      this.googleTaskLists.set(response.items || []);
    } catch (error) {
      console.error('Failed to load Google Task lists:', error);
      this.googleTaskLists.set([]);
    } finally {
      this.loadingTaskLists.set(false);
    }
  }

  async selectTaskList(listId: string) {
    try {
      await this.projectService.updateProject(this.project().id, {
        googleTaskListId: listId,
        syncEnabled: true,
        syncStatus: 'pending',
      });
      this.projectChanged.emit();
      this.showListSelector.set(false); // Hide selector after selection
      this.closePreview(); // Close any open preview
    } catch (error) {
      console.error('Failed to select task list:', error);
    }
  }

  async previewList(listId: string, listName: string) {
    // Toggle off if already previewing this list
    if (this.previewingListId() === listId) {
      this.closePreview();
      return;
    }

    this.previewingListId.set(listId);
    this.previewingListName.set(listName);
    this.loadingPreview.set(true);
    this.previewTasks.set([]);

    try {
      const response = await firstValueFrom(this.googleTasksService.getTasks(listId));
      this.previewTasks.set(response.items || []);
    } catch (error) {
      console.error('Failed to load preview:', error);
      this.previewTasks.set([]);
    } finally {
      this.loadingPreview.set(false);
    }
  }

  closePreview() {
    this.previewingListId.set(null);
    this.previewingListName.set(null);
    this.previewTasks.set([]);
  }

  async onTaskListChange(event: Event) {
    const taskListId = (event.target as HTMLSelectElement).value;
    try {
      // Build update object without undefined values (Firestore rejects undefined)
      const updateData: Record<string, any> = {};
      if (taskListId) {
        updateData['googleTaskListId'] = taskListId;
        updateData['syncStatus'] = 'pending';
      } else {
        // Use deleteField() or null to clear the field
        updateData['googleTaskListId'] = null;
        updateData['syncStatus'] = null;
      }
      await this.projectService.updateProject(this.project().id, updateData);
      this.projectChanged.emit();
    } catch (error) {
      console.error('Failed to update task list:', error);
    }
  }

  async triggerSync() {
    if (!this.project().googleTaskListId) {
      await this.dialogService.alert('Please select a Google Task list first.', 'Sync Required');
      return;
    }

    this.syncing.set(true);
    try {
      // Update sync status to pending
      await this.projectService.updateProject(this.project().id, { syncStatus: 'pending' });
      this.projectChanged.emit();

      // Get the last sync timestamp to only fetch updated tasks
      const lastSyncAt = this.project().lastSyncAt;
      const lastSyncDate = lastSyncAt
        ? lastSyncAt instanceof Date
          ? lastSyncAt
          : (lastSyncAt as any).toDate?.() || new Date(0)
        : undefined;

      // Pull tasks from Google Tasks to OmniTask (reverse sync)
      const result = await this.googleTasksSyncService.pullFromGoogleTasks(
        this.project().id,
        this.project().googleTaskListId!,
        lastSyncDate,
      );

      console.log(`Sync complete: ${result.added} added, ${result.updated} updated`);

      // Mark as synced and show result
      await this.projectService.updateProject(this.project().id, {
        syncStatus: 'synced',
        lastSyncAt: new Date(),
      });
      this.projectChanged.emit();

      // Show success feedback
      this.lastSyncResult.set({
        success: true,
        message: `✓ ${result.added} added, ${result.updated} updated, ${result.pushed} synced to Google`,
      });

      // Clear the message after 5 seconds
      setTimeout(() => this.lastSyncResult.set(null), 5000);
    } catch (error) {
      console.error('Sync failed:', error);
      await this.projectService.updateProject(this.project().id, { syncStatus: 'error' });

      // Show error feedback
      this.lastSyncResult.set({
        success: false,
        message: 'Sync failed. Please check your connection and try again.',
      });
    } finally {
      this.syncing.set(false);
    }
  }

  formatSyncDate(date: Date | { toDate: () => Date } | null | undefined): string {
    if (!date) return 'Never';
    const d =
      date instanceof Date ? date : ((date as { toDate?: () => Date }).toDate?.() ?? new Date());
    return d.toLocaleString();
  }

  async reconnectGoogleTasks() {
    // Sign out will clear the token, forcing re-authentication with Tasks scope
    await this.authService.logout();
  }

  async disconnectGoogleTasks() {
    const confirmed = await this.dialogService.confirm(
      'This will disconnect Google Tasks from this project. Your tasks will remain, but sync will stop.',
      'Disconnect Google Tasks?',
    );
    if (confirmed) {
      try {
        await this.projectService.updateProject(this.project().id, {
          syncEnabled: false,
          googleTaskListId: null as any,
          syncStatus: null as any,
        } as any);
        this.projectChanged.emit();
        this.googleTaskLists.set([]);
      } catch (error) {
        console.error('Failed to disconnect:', error);
      }
    }
  }

  toggleTaskPreview() {
    const wasOpen = this.showTaskPreview();
    this.showTaskPreview.set(!wasOpen);

    // Auto-load when opening
    if (!wasOpen) {
      this.loadTaskPreview();
    }
  }

  async loadTaskPreview() {
    const listId = this.project().googleTaskListId;
    if (!listId || !this.googleTasksAuthenticated()) return;

    this.loadingPreview.set(true);
    try {
      const response = await firstValueFrom(this.googleTasksService.getTasks(listId));
      this.previewTasks.set(response.items || []);
    } catch (error) {
      console.error('Failed to load task preview:', error);
      this.previewTasks.set([]);
    } finally {
      this.loadingPreview.set(false);
    }
  }

  formatPreviewDate(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return dateStr;
      }
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  /**
   * Enable scheduled sync by requesting offline access from Google.
   * This allows Cloud Functions to sync tasks in the background.
   */
  async enableScheduledSync() {
    this.enablingScheduledSync.set(true);
    try {
      const success = await this.authService.requestOfflineAccess();
      if (success) {
        this.lastSyncResult.set({
          success: true,
          message: 'Scheduled sync enabled! Tasks will sync automatically every 5 minutes.',
        });
        setTimeout(() => this.lastSyncResult.set(null), 5000);
      }
    } catch (error) {
      console.error('Failed to enable scheduled sync:', error);
      this.lastSyncResult.set({
        success: false,
        message: 'Failed to enable scheduled sync. Please try again.',
      });
    } finally {
      this.enablingScheduledSync.set(false);
    }
  }
}

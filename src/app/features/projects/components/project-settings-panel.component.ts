import { Component, input, output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import { SectionManagerComponent } from './section-manager.component';
import { TagManagerComponent } from './tag-manager.component';
import { CustomFieldManagerComponent } from './custom-field-manager/custom-field-manager.component';
import { ProjectMemberManagerComponent } from './project-member-manager.component';
import { firstValueFrom } from 'rxjs';

/**
 * Project colors for selection
 */
const PROJECT_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#0ea5e9', // Sky
  '#00d2ff', // Cyan (OmniFlex accent)
];

/**
 * Project Settings Panel Component
 * Comprehensive project configuration including basic info, sections, tags, custom fields
 */
@Component({
  selector: 'app-project-settings-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SectionManagerComponent,
    TagManagerComponent,
    CustomFieldManagerComponent,
    ProjectMemberManagerComponent,
  ],
  templateUrl: './project-settings-panel.component.html',
  styles: [
    `
      .ofx-settings-section {
        /* Section styling handled by parent */
      }

      .ofx-section-title {
        font-size: 0.875rem;
        font-weight: 600;
        color: rgb(203, 213, 225);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
    `,
  ],
})
export class ProjectSettingsPanelComponent {
  private projectService = inject(ProjectService);
  private dialogService = inject(DialogService);
  private googleTasksService = inject(GoogleTasksService);
  private googleTasksSyncService = inject(GoogleTasksSyncService);
  private authService = inject(AuthService);

  project = input.required<Project>();
  projectChanged = output<void>();
  projectDeleted = output<void>();

  colors = PROJECT_COLORS;

  // Edit state
  editName = '';
  editDescription = '';
  saving = signal(false);

  hasBasicChanges = signal(false);
  private previousProjectId: string | null = null;

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
    this.resetBasicInfo();
    // Load task lists if sync is already enabled
    this.initGoogleTaskLists();
  }

  ngOnChanges() {
    const currentId = this.project().id;
    const projectSwitched = this.previousProjectId !== null && this.previousProjectId !== currentId;
    this.previousProjectId = currentId;

    // Always reset when switching between projects to prevent stale
    // edits from one project leaking into another (component reuse
    // on parameterized routes). Only preserve edits for same-project
    // Firestore live updates.
    if (projectSwitched || !this.hasBasicChanges()) {
      this.resetBasicInfo();
    }
    // Reload task lists if sync is enabled for this project
    this.initGoogleTaskLists();
  }

  private async initGoogleTaskLists() {
    // Always load task lists when authenticated, so user can select one
    if (this.googleTasksAuthenticated()) {
      await this.loadGoogleTaskLists();
    }
  }

  resetBasicInfo() {
    this.editName = this.project().name;
    this.editDescription = this.project().description || '';
    this.hasBasicChanges.set(false);
  }

  onNameChange(event: Event) {
    this.editName = (event.target as HTMLInputElement).value;
    this.checkBasicChanges();
  }

  onDescriptionChange(event: Event) {
    this.editDescription = (event.target as HTMLTextAreaElement).value;
    this.checkBasicChanges();
  }

  checkBasicChanges() {
    const hasChanges =
      this.editName !== this.project().name ||
      this.editDescription !== (this.project().description || '');
    this.hasBasicChanges.set(hasChanges);
  }

  async updateColor(color: string) {
    try {
      await this.projectService.updateProject(this.project().id, { color });
      this.projectChanged.emit();
    } catch (error) {
      console.error('Failed to update color:', error);
    }
  }

  async saveBasicInfo() {
    if (!this.editName.trim()) return;

    this.saving.set(true);
    try {
      await this.projectService.updateProject(this.project().id, {
        name: this.editName.trim(),
        description: this.editDescription.trim(),
      });
      this.hasBasicChanges.set(false);
      this.projectChanged.emit();
    } catch (error) {
      console.error('Failed to save project:', error);
    } finally {
      this.saving.set(false);
    }
  }

  getOwnerInitial(): string {
    return this.project().ownerId?.charAt(0)?.toUpperCase() || 'O';
  }

  async toggleArchive() {
    const project = this.project();
    const action = project.status === 'active' ? 'archive' : 'restore';

    if (
      await this.dialogService.confirm(
        `Are you sure you want to ${action} this project?`,
        `${action === 'archive' ? 'Archive' : 'Restore'} Project`,
      )
    ) {
      try {
        if (project.status === 'active') {
          await this.projectService.archiveProject(project.id);
        } else {
          await this.projectService.restoreProject(project.id);
        }
        this.projectChanged.emit();
      } catch (error) {
        console.error(`Failed to ${action} project:`, error);
      }
    }
  }

  async confirmDelete() {
    const confirmed = await this.dialogService.confirm(
      `Are you sure you want to DELETE "${
        this.project().name
      }"?\n\nThis will permanently remove the project and ALL its tasks. This action cannot be undone.`,
      'Delete Project',
    );

    if (confirmed) {
      try {
        await this.projectService.deleteProject(this.project().id);
        this.projectDeleted.emit();
      } catch (error) {
        console.error('Failed to delete project:', error);
      }
    }
  }

  // Google Tasks Methods

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
    try {
      const date = new Date(dateStr);
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

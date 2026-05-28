import {
  Component,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { switchMap, of } from 'rxjs';

import { TaskService } from '../../core/services/task.service';
import { ProjectService } from '../../core/services/project.service';
import { AuthService } from '../../core/auth/auth.service';
import { DialogService } from '../../core/services/dialog.service';
import { SeedDataService } from '../../core/services/seed-data.service';
import {
  GoogleSheetsSyncService,
  DEFAULT_SHEET_TAB_NAME,
} from '../../core/services/google-sheets-sync.service';
import { GoogleSheetsService } from '../../core/services/google-sheets.service';
import { Project, Task, TaskViewMode } from '../../core/models/domain.model';
import { TaskTimelineViewComponent } from '../tasks/task-timeline-view.component';

import { ProjectSidebarComponent } from '../projects/project-sidebar.component';
import { ProjectFormModalComponent } from '../projects/project-form-modal.component';
import { CustomFieldManagerComponent } from '../projects/components/custom-field-manager/custom-field-manager.component';
import { TaskListViewComponent } from '../tasks/task-list-view.component';
import { TaskBoardViewComponent } from '../tasks/task-board-view.component';
import { TaskCalendarViewComponent } from '../tasks/task-calendar-view.component';
import { TaskDetailModalComponent } from '../tasks/task-detail-modal.component';
import { TaskCreateModalComponent } from '../tasks/task-create-modal.component';
import { DashboardHeaderComponent } from './components/dashboard-header';
import { ProjectOverviewComponent } from './components/project-overview.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    ProjectSidebarComponent,
    ProjectFormModalComponent,
    TaskListViewComponent,
    TaskBoardViewComponent,
    TaskCalendarViewComponent,
    TaskTimelineViewComponent,
    TaskDetailModalComponent,
    TaskCreateModalComponent,
    CustomFieldManagerComponent,
    DashboardHeaderComponent,
    ProjectOverviewComponent,
  ],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  auth = inject(AuthService);
  projectService = inject(ProjectService);
  taskService = inject(TaskService);
  seedService = inject(SeedDataService);
  dialogService = inject(DialogService);
  router = inject(Router);
  readonly googleSheetsSyncService = inject(GoogleSheetsSyncService);
  readonly googleSheetsService = inject(GoogleSheetsService);

  // State
  selectedProjectId = this.projectService.selectedProjectId;
  viewMode = signal<TaskViewMode>('overview');
  seeding = signal(false);
  syncing = signal(false);
  mobileSidebarOpen = signal(false);

  constructor() {
    this.seedSampleDataIfNeeded();
  }

  private async seedSampleDataIfNeeded() {
    this.seeding.set(true);
    try {
      await this.seedService.seedIfEmpty();
    } catch (err) {
      console.error('Failed to seed data:', err);
    } finally {
      this.seeding.set(false);
    }
  }

  // Modals state
  editProjectModal = signal<Project | null>(null);
  showFieldManager = signal(false);
  openTask = signal<Task | null>(null);

  // Create modal state
  showCreateModal = signal(false);
  createModalSectionId = signal<string | null>(null);
  createModalDueDate = signal<Date | null>(null);

  // Derived state for Current Project
  currentProject = toSignal(
    toObservable(this.selectedProjectId).pipe(
      switchMap((id) => (id ? this.projectService.getProject$(id) : of(null))),
    ),
    { initialValue: null },
  );

  // Derived state for Tasks of Current Project
  tasks = toSignal(
    toObservable(this.selectedProjectId).pipe(
      switchMap((id) => (id ? this.taskService.getTasksByProject(id) : of([]))),
    ),
    { initialValue: [] },
  );

  onProjectSelect(project: Project) {
    this.selectedProjectId.set(project.id);
  }

  onProjectSaved(project: Project) {
    this.editProjectModal.set(null);
  }

  openCreateTaskModal(sectionId?: string, dueDate?: Date) {
    if (!this.selectedProjectId()) return;
    this.createModalSectionId.set(sectionId || null);
    this.createModalDueDate.set(dueDate || null);
    this.showCreateModal.set(true);
  }

  closeCreateModal() {
    this.showCreateModal.set(false);
    this.createModalSectionId.set(null);
    this.createModalDueDate.set(null);
  }

  onTaskCreated(task: Task) {
    // Firestore subscription handles the list update
    // Optionally open the task detail for further edits
    // this.openTask.set(task);
  }

  openTaskDetail(task: Task) {
    this.openTask.set(task);
  }

  onTaskUpdated(task: Task) {
    // Optimistic update if needed, but Firestore subscription handles it.
  }

  onTaskDeleted(taskId: string) {
    this.openTask.set(null);
  }

  async deleteTask(taskId: string) {
    if (await this.dialogService.confirm('Are you sure you want to delete this task?')) {
      await this.taskService.deleteTask(taskId);
    }
  }

  quickAddInBoard(sectionId: string) {
    this.openCreateTaskModal(sectionId);
  }

  addTaskForDate(date: Date) {
    this.openCreateTaskModal(undefined, date);
  }

  /** Overview-pane handler: create task with optional seed section/date. */
  createTaskFromOverview(payload: { sectionId?: string; dueDate?: Date }) {
    this.openCreateTaskModal(payload.sectionId, payload.dueDate);
  }

  async addSection() {
    const pid = this.selectedProjectId();
    if (pid) {
      const name = prompt('Section Name:');
      if (name && name.trim()) {
        await this.projectService.addSection(pid, name.trim());
      }
    }
  }

  async syncGoogleSheet(): Promise<void> {
    const project = this.currentProject();
    if (!project?.googleSheetId) {
      await this.dialogService.alert(
        'Please link a Google Sheet in project settings first.',
        'Sync Not Configured',
      );
      return;
    }

    if (!this.googleSheetsService.isAuthenticated()) {
      const shouldReauth = await this.dialogService.confirm(
        'Google Sheets is not connected. You need to sign out and sign in again to grant permission to access Google Sheets.\n\nWould you like to sign out now?',
        'Google Sheets Not Connected',
      );
      if (shouldReauth) {
        await this.auth.logout();
      }
      return;
    }

    this.syncing.set(true);
    try {
      await this.projectService.updateProject(project.id, { sheetSyncStatus: 'pending' });

      const tabName = project.googleSheetTabName || DEFAULT_SHEET_TAB_NAME;
      const result = await this.googleSheetsSyncService.syncProjectWithSheet(
        project.id,
        project.googleSheetId,
        tabName,
      );

      await this.projectService.updateProject(project.id, {
        sheetSyncStatus: 'synced',
        lastSheetSyncAt: new Date(),
      });

      await this.dialogService.alert(
        `Sync complete!\n\n${result.added} added, ${result.updated} updated, ${result.pushed} pushed to the sheet.`,
        'Sync Successful',
      );
    } catch (error: unknown) {
      console.error('Sheet sync failed:', error);
      await this.projectService.updateProject(project.id, { sheetSyncStatus: 'error' });

      let errorMessage = 'Sync failed. Please try again.';
      const err = error as { message?: string; status?: number };
      if (err?.message?.includes('not authenticated')) {
        errorMessage = 'Google Sheets authentication expired. Please sign out and sign in again.';
      } else if (err?.status === 401 || err?.status === 403) {
        errorMessage = 'Access denied. Please sign out and sign in again to refresh permissions.';
      }
      await this.dialogService.alert(errorMessage, 'Sync Error');
    } finally {
      this.syncing.set(false);
    }
  }
}

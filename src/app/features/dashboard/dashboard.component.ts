import {
  Component,
  computed,
  inject,
  signal,
  effect,
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
import { GoogleTasksSyncService } from '../../core/services/google-tasks-sync.service';
import { GoogleTasksService } from '../../core/services/google-tasks.service';
import { Project, Task, TaskViewMode } from '../../core/models/domain.model';

import { ProjectSidebarComponent } from '../projects/project-sidebar.component';
import { ProjectFormModalComponent } from '../projects/project-form-modal.component';
import { CustomFieldManagerComponent } from '../projects/components/custom-field-manager/custom-field-manager.component';
import { TaskListViewComponent } from '../tasks/task-list-view.component';
import { TaskBoardViewComponent } from '../tasks/task-board-view.component';
import { TaskCalendarViewComponent } from '../tasks/task-calendar-view.component';
import { TaskDetailModalComponent } from '../tasks/task-detail-modal.component';
import { TaskCreateModalComponent } from '../tasks/task-create-modal.component';
import { DashboardHeaderComponent } from './components/dashboard-header';

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
    TaskDetailModalComponent,
    TaskCreateModalComponent,
    CustomFieldManagerComponent,
    DashboardHeaderComponent,
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
  googleTasksSyncService = inject(GoogleTasksSyncService);
  googleTasksService = inject(GoogleTasksService);

  // State
  selectedProjectId = this.projectService.selectedProjectId;
  viewMode = signal<TaskViewMode>('list');
  seeding = signal(false);
  syncing = signal(false);

  constructor() {
    // Seed sample data if user has no projects
    this.seedSampleDataIfNeeded();
  }

  private async seedSampleDataIfNeeded() {
    this.seeding.set(true);
    try {
      const seeded = await this.seedService.seedIfEmpty();
      if (seeded) {
        console.log('Sample data created for new user!');
      }
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

  async addSection() {
    const pid = this.selectedProjectId();
    if (pid) {
      const name = prompt('Section Name:');
      if (name && name.trim()) {
        await this.projectService.addSection(pid, name.trim());
      }
    }
  }

  async syncGoogleTasks() {
    const project = this.currentProject();
    if (!project?.googleTaskListId) {
      await this.dialogService.alert(
        'Please configure Google Tasks sync in project settings first.',
        'Sync Not Configured',
      );
      return;
    }

    // Check if Google Tasks is authenticated
    if (!this.googleTasksService.isAuthenticated()) {
      const shouldReauth = await this.dialogService.confirm(
        'Google Tasks is not connected. You need to sign out and sign in again to grant permission to access Google Tasks.\n\nWould you like to sign out now?',
        'Google Tasks Not Connected',
      );
      if (shouldReauth) {
        await this.auth.logout();
      }
      return;
    }

    this.syncing.set(true);
    try {
      // Update sync status to pending
      await this.projectService.updateProject(project.id, { syncStatus: 'pending' });

      // Get the last sync timestamp
      const lastSyncAt = project.lastSyncAt;
      const lastSyncDate = lastSyncAt
        ? lastSyncAt instanceof Date
          ? lastSyncAt
          : (lastSyncAt as any).toDate?.() || undefined
        : undefined;

      // Pull tasks from Google Tasks
      const result = await this.googleTasksSyncService.pullFromGoogleTasks(
        project.id,
        project.googleTaskListId,
        lastSyncDate,
      );

      console.log(`Sync complete: ${result.added} added, ${result.updated} updated`);

      // Show success message
      await this.dialogService.alert(
        `Sync complete!\n\n${result.added} tasks added, ${result.updated} tasks updated.`,
        'Sync Successful',
      );

      // Mark as synced
      await this.projectService.updateProject(project.id, {
        syncStatus: 'synced',
        lastSyncAt: new Date(),
      });
    } catch (error: unknown) {
      console.error('Sync failed:', error);
      await this.projectService.updateProject(project.id, { syncStatus: 'error' });

      // Provide specific error message
      let errorMessage = 'Sync failed. Please try again.';
      const err = error as { message?: string; status?: number };
      if (err?.message?.includes('not authenticated')) {
        errorMessage = 'Google Tasks authentication expired. Please sign out and sign in again.';
      } else if (err?.status === 401 || err?.status === 403) {
        errorMessage = 'Access denied. Please sign out and sign in again to refresh permissions.';
      }
      await this.dialogService.alert(errorMessage, 'Sync Error');
    } finally {
      this.syncing.set(false);
    }
  }
}

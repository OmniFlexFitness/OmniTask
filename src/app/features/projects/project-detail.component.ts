import {
  Component,
  computed,
  inject,
  signal,
  effect,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';

import { ProjectService } from '../../core/services/project.service';
import { TaskService } from '../../core/services/task.service';
import { DialogService } from '../../core/services/dialog.service';
import { GoogleSheetsAutoSyncService } from '../../core/services/google-sheets-auto-sync.service';
import { Project, Task, TaskViewMode } from '../../core/models/domain.model';

import { ProjectStatsCardComponent } from './components/project-stats-card.component';
import { ProjectSettingsPanelComponent } from './components/project-settings-panel.component';
import { TaskListViewComponent } from '../tasks/task-list-view.component';
import { TaskBoardViewComponent } from '../tasks/task-board-view.component';
import { TaskCalendarViewComponent } from '../tasks/task-calendar-view.component';
import { TaskDetailModalComponent } from '../tasks/task-detail-modal.component';
import { TaskCreateModalComponent } from '../tasks/task-create-modal.component';

type ProjectTab = 'overview' | 'tasks' | 'settings';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [
    CommonModule,
    ProjectStatsCardComponent,
    ProjectSettingsPanelComponent,
    TaskListViewComponent,
    TaskBoardViewComponent,
    TaskCalendarViewComponent,
    TaskDetailModalComponent,
    TaskCreateModalComponent,
  ],
  templateUrl: './project-detail.component.html',
  styleUrls: ['./project-detail.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDetailComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);
  private readonly taskService = inject(TaskService);
  private readonly dialogService = inject(DialogService);
  private readonly sheetsAutoSync = inject(GoogleSheetsAutoSyncService);

  // Tab State
  activeTab = signal<ProjectTab>('overview');
  taskViewMode = signal<TaskViewMode>('list');

  // ID from route
  projectId = toSignal(this.route.paramMap.pipe(switchMap((params) => of(params.get('id')))));

  // Data
  project = toSignal(
    this.projectId()
      ? this.route.paramMap.pipe(
          switchMap((params) => this.projectService.getProject$(params.get('id')!)),
        )
      : of(null),
  );

  tasks = toSignal(
    this.projectId()
      ? this.route.paramMap.pipe(
          switchMap((params) => this.taskService.getTasksByProject(params.get('id')!)),
        )
      : of([]),
    { initialValue: [] },
  );

  // Modal State
  openTask = signal<Task | null>(null);
  showCreateModal = signal(false);
  createModalSectionId = signal<string | null>(null);
  createModalDueDate = signal<Date | null>(null);

  // Reactive query params
  queryParams = toSignal(this.route.queryParamMap);

  constructor() {
    // Sync tab state with URL query params
    effect(() => {
      const params = this.queryParams();
      const tab = params?.get('tab');
      if (tab && (tab === 'overview' || tab === 'tasks' || tab === 'settings')) {
        this.activeTab.set(tab as ProjectTab);
      }
    });

    // Update global selected project ID when viewing this page
    effect(() => {
      const id = this.projectId();
      if (id) {
        this.projectService.selectedProjectId.set(id);
      }
    });

    // Persistent Google Sheets sync: whenever this project is open AND has a
    // sheet linked, run an immediate sync and keep polling while mounted.
    // Auto-stops when navigating away (ngOnDestroy below) or when the project
    // has no sheet linked.
    effect(() => {
      const p = this.project();
      if (p?.googleSheetId) {
        this.sheetsAutoSync.start(p.id);
      } else {
        this.sheetsAutoSync.stop();
      }
    });
  }

  ngOnDestroy() {
    this.sheetsAutoSync.stop();
  }

  goBack() {
    this.router.navigate(['/projects']);
  }

  updateTab(tab: ProjectTab) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
    });
  }

  // Task Actions
  openTaskDetail(task: Task) {
    this.openTask.set(task);
  }

  openCreateTaskModal() {
    this.showCreateModal.set(true);
  }

  closeCreateModal() {
    this.showCreateModal.set(false);
    this.createModalSectionId.set(null);
    this.createModalDueDate.set(null);
  }

  quickAddInBoard(sectionId: string) {
    this.createModalSectionId.set(sectionId);
    this.showCreateModal.set(true);
  }

  addTaskForDate(date: Date) {
    this.createModalDueDate.set(date);
    this.showCreateModal.set(true);
  }

  async deleteTask(taskId: string) {
    if (await this.dialogService.confirm('Are you sure you want to delete this task?')) {
      await this.taskService.deleteTask(taskId);
    }
  }

  // Event Handlers
  onProjectUpdated() {
    // Firestore subscription handles data updates
    console.log('Project updated');
  }

  onProjectDeleted() {
    this.router.navigate(['/projects']);
  }

  onTaskCreated() {
    // Close modal handled by component
    // Data updates via subscription
  }

  onTaskUpdated() {
    // Data updates via subscription
  }

  onTaskDeleted() {
    this.openTask.set(null);
  }
}

import {
  Component,
  ChangeDetectionStrategy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { TaskService } from '../../core/services/task.service';
import { ProjectService } from '../../core/services/project.service';
import { UserService } from '../../core/services/user.service';
import { DialogService } from '../../core/services/dialog.service';
import { MyTasksSheetSyncService } from '../../core/services/my-tasks-sheet-sync.service';
import { GoogleSheetsService } from '../../core/services/google-sheets.service';
import { Project, Task } from '../../core/models/domain.model';
import { UserProfile } from '../../core/models/user.model';

import { TaskDetailModalComponent } from '../tasks/task-detail-modal.component';
import { TaskCreateModalComponent } from '../tasks/task-create-modal.component';
import { MyTasksOverviewComponent } from './components/my-tasks-overview.component';
import { MyTasksListComponent } from './components/my-tasks-list.component';
import { AvailableTasksComponent } from './components/available-tasks.component';

/** The three top-level panes users can switch between on the My Tasks page. */
export type MyTasksViewMode = 'overview' | 'list' | 'available';

/**
 * User-centric dashboard that mirrors the project dashboard but indexes
 * everything by the signed-in user. Displays tasks the user is assigned to
 * or created, projects they're part of (active + completed), reporting
 * links, contribution metrics, and a pickup queue of unassigned tasks in
 * their projects.
 */
@Component({
  selector: 'app-my-tasks',
  standalone: true,
  imports: [
    CommonModule,
    TaskDetailModalComponent,
    TaskCreateModalComponent,
    MyTasksOverviewComponent,
    MyTasksListComponent,
    AvailableTasksComponent,
  ],
  templateUrl: './my-tasks.component.html',
  styleUrls: ['./my-tasks.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyTasksComponent {
  private readonly auth = inject(AuthService);
  private readonly taskService = inject(TaskService);
  private readonly projectService = inject(ProjectService);
  private readonly userService = inject(UserService);
  private readonly dialogService = inject(DialogService);
  private readonly sheetSync = inject(MyTasksSheetSyncService);
  private readonly sheetsService = inject(GoogleSheetsService);

  // Expose auth as a public template property so `<app-my-tasks-overview>`
  // can bind directly to current-user info via the component.
  readonly currentUser = computed(() => this.auth.currentUserSig());

  // Active top-level pane. Overview is the default entry because it answers
  // "what's going on with me?" at a glance.
  viewMode = signal<MyTasksViewMode>('overview');

  // Modal state — reuse the same detail/create modals the project dashboard uses.
  openTask = signal<Task | null>(null);
  showCreateModal = signal(false);
  createInitialProjectId = signal<string | null>(null);

  syncing = signal(false);

  // --------- User-centric data streams ---------

  /** Tasks the user is assigned to or created, across every project. */
  myTasks = toSignal(
    toObservable(this.currentUser).pipe(
      switchMap((u) => (u ? this.taskService.getMyTasks(u.uid) : of([] as Task[]))),
    ),
    { initialValue: [] as Task[] },
  );

  /** Projects the user is a member of (active + archived). */
  myProjects = toSignal(this.projectService.getMyProjects(), {
    initialValue: [] as Project[],
  });

  /** Available tasks in any of the user's projects that have no assignee. */
  availableTasks = toSignal(
    toObservable(this.myProjects).pipe(
      switchMap((projects) =>
        projects.length === 0
          ? of([] as Task[])
          : this.taskService.getAvailableTasksInProjects(
              projects.filter((p) => p.status === 'active').map((p) => p.id),
            ),
      ),
    ),
    { initialValue: [] as Task[] },
  );

  /** Quick lookup: projectId → Project. */
  projectsById = computed(() => {
    const map = new Map<string, Project>();
    for (const p of this.myProjects()) map.set(p.id, p);
    return map;
  });

  /**
   * Counts we don't want to recompute in every child — total/completed/etc.
   * Exposed via the overview component.
   */
  taskCounts = computed(() => {
    const tasks = this.myTasks();
    return {
      total: tasks.length,
      done: tasks.filter((t) => t.status === 'done').length,
      inProgress: tasks.filter((t) => t.status === 'in-progress').length,
      todo: tasks.filter((t) => t.status === 'todo').length,
    };
  });

  /** Counts for the nav pill on each pane. */
  availableCount = computed(() => this.availableTasks().length);
  listCount = computed(() => this.myTasks().filter((t) => t.status !== 'done').length);

  // --------- Actions ---------

  /**
   * Open the task detail modal for a task in any of the user's projects.
   * The modal itself fetches the section list by projectId.
   */
  openTaskDetail(task: Task) {
    this.openTask.set(task);
  }

  /**
   * Open the create-task modal for a chosen project. When no project is
   * given, we create the task inside the user's personal (auto-created)
   * project so "My Tasks" can always create a task without requiring the
   * user to first create a project of their own.
   */
  async openCreateForProject(projectId: string | null) {
    let targetId = projectId;
    if (!targetId) {
      const personal = await this.projectService.getOrCreatePersonalProject();
      targetId = personal.id;
    }
    this.createInitialProjectId.set(targetId);
    this.showCreateModal.set(true);
  }

  closeCreateModal() {
    this.showCreateModal.set(false);
    this.createInitialProjectId.set(null);
  }

  async onTaskCreated(task: Task) {
    // "Add to my queue" intent: only auto-claim tasks the creator left
    // entirely unassigned. If the creator explicitly picked assignees
    // (even if they're not on the list), respect that choice — silently
    // adding the creator would distort workload and notifications.
    const user = this.currentUser();
    if (!user) return;
    const hasAssignees = (task.assigneeIds?.length ?? 0) > 0 || !!task.assignedToId;
    if (hasAssignees) return;
    try {
      await this.taskService.claimTask(task.id);
    } catch (err) {
      console.warn('Auto-claim of newly created task failed:', err);
    }
  }

  /**
   * Self-assign a task from the "Available" queue. Errors are surfaced via
   * the dialog service so the user sees a clear message rather than a
   * console warning.
   */
  async claimTask(task: Task) {
    try {
      await this.taskService.claimTask(task.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to claim task';
      await this.dialogService.alert(message, 'Could not claim task');
    }
  }

  /** Mark the task done inline (used by the compact list view). */
  async toggleComplete(task: Task) {
    try {
      await this.taskService.updateTask(task.id, {
        status: task.status === 'done' ? 'todo' : 'done',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update task';
      await this.dialogService.alert(message, 'Update failed');
    }
  }

  /**
   * Persist a manager link. Wrapped here so the overview component doesn't
   * need to depend on UserService directly.
   */
  async saveReportsTo(manager: UserProfile | null) {
    const user = this.currentUser();
    if (!user) return;
    try {
      await this.userService.setReportsTo(user.uid, manager);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save manager';
      await this.dialogService.alert(message, 'Update failed');
    }
  }

  /**
   * Push the user's tasks + projects + contributions to their personal
   * Google Sheet, creating the sheet if necessary. A full replace — the
   * sheet always mirrors the current state of the My Tasks dashboard.
   */
  async syncToGoogleSheet() {
    const user = this.currentUser();
    if (!user) return;
    if (!this.sheetsService.isAuthenticated()) {
      const shouldReauth = await this.dialogService.confirm(
        'Google Sheets is not connected. You need to sign in again to grant access.\n\nSign out now?',
        'Google Sheets Not Connected',
      );
      if (shouldReauth) await this.auth.logout();
      return;
    }
    this.syncing.set(true);
    try {
      // Pre-compute per-project task maps so the sheet sync service doesn't
      // need to re-query Firestore for every project.
      const projectTasks = new Map<string, Task[]>();
      for (const p of this.myProjects()) {
        // Pull from the cached myTasks + availableTasks universe. This
        // covers the user's view; projects the user barely touched may
        // only contain tasks we already know about — which is fine for a
        // per-user sheet (they won't see other people's workload).
        const mine = this.myTasks().filter((t) => t.projectId === p.id);
        const avail = this.availableTasks().filter((t) => t.projectId === p.id);
        const byId = new Map<string, Task>();
        for (const t of [...mine, ...avail]) byId.set(t.id, t);
        projectTasks.set(p.id, Array.from(byId.values()));
      }
      const { spreadsheetId, pushed } = await this.sheetSync.syncMySheet(
        user,
        this.myTasks(),
        this.myProjects(),
        projectTasks,
      );
      await this.dialogService.alert(
        `Synced ${pushed} rows to your personal Google Sheet.\n\nhttps://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        'My Tasks synced',
      );
    } catch (err) {
      console.error('My Tasks sheet sync failed:', err);
      const message = err instanceof Error ? err.message : 'Sheet sync failed';
      await this.dialogService.alert(message, 'Sync error');
    } finally {
      this.syncing.set(false);
    }
  }
}

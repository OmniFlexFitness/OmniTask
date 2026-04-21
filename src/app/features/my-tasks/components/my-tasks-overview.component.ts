import {
  Component,
  ChangeDetectionStrategy,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { Project, Task, ASSIGNEE_PALETTE, CYBERPUNK_COLORS } from '../../../core/models/domain.model';
import { UserProfile } from '../../../core/models/user.model';
import { UserService } from '../../../core/services/user.service';
import type { MyTasksViewMode } from '../my-tasks.component';

interface ProjectContribution {
  project: Project;
  role: 'Owner' | 'Member';
  totalMyTasks: number;
  completed: number;
  inProgress: number;
  todo: number;
  created: number;
  progress: number;
  lastActivity: Date | null;
}

interface ReportsToPerson {
  uid: string;
  name: string;
  email?: string;
  role: 'Manager' | 'Project Owner';
  projectName?: string;
}

/** A day counts as "due soon" when it falls inside this window. */
const DUE_SOON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The big user-centric panel on the My Tasks dashboard. Everything here is
 * derived from (user, myTasks, myProjects) — the container component owns
 * data fetching, this component is pure presentation + a few inline edits
 * (e.g. picking a manager, jumping to a specific view).
 */
@Component({
  selector: 'app-my-tasks-overview',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, RouterLink],
  templateUrl: './my-tasks-overview.component.html',
  styleUrls: ['./my-tasks-overview.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyTasksOverviewComponent {
  private readonly userService = inject(UserService);

  user = input<UserProfile | null>(null);
  myTasks = input.required<Task[]>();
  myProjects = input.required<Project[]>();
  availableCount = input<number>(0);

  taskClick = output<Task>();
  createTask = output<string | null>();
  viewChange = output<MyTasksViewMode>();
  reportsToChange = output<UserProfile | null>();

  readonly defaultColor = CYBERPUNK_COLORS.TODO;

  /** Inline manager-editor state. Kept local so the parent only hears the save event. */
  editingReportsTo = signal(false);
  managerEmailInput = signal('');
  managerLookupError = signal<string | null>(null);
  managerLookupBusy = signal(false);

  // --------- Task-side KPIs ---------

  totalTasks = computed(() => this.myTasks().length);
  doneTasks = computed(() => this.myTasks().filter((t) => t.status === 'done').length);
  inProgressTasks = computed(
    () => this.myTasks().filter((t) => t.status === 'in-progress').length,
  );
  todoTasks = computed(() => this.myTasks().filter((t) => t.status === 'todo').length);

  overdueTasks = computed(() => {
    const now = Date.now();
    return this.myTasks().filter((t) => {
      if (t.status === 'done' || !t.dueDate) return false;
      return this.toMillis(t.dueDate) < now;
    }).length;
  });

  dueSoonTasks = computed(() => {
    const now = Date.now();
    const soon = now + DUE_SOON_WINDOW_MS;
    return this.myTasks().filter((t) => {
      if (t.status === 'done' || !t.dueDate) return false;
      const ms = this.toMillis(t.dueDate);
      return ms >= now && ms <= soon;
    }).length;
  });

  completionPct = computed(() => {
    const total = this.totalTasks();
    return total === 0 ? 0 : Math.round((this.doneTasks() / total) * 100);
  });

  // --------- Status donut ---------

  statusBreakdown = computed(() => {
    const total = Math.max(this.totalTasks(), 1);
    const segments = [
      { key: 'done' as const, label: 'Done', count: this.doneTasks(), color: '#10b981' },
      {
        key: 'in-progress' as const,
        label: 'In Progress',
        count: this.inProgressTasks(),
        color: CYBERPUNK_COLORS.IN_PROGRESS,
      },
      {
        key: 'todo' as const,
        label: 'To Do',
        count: this.todoTasks(),
        color: CYBERPUNK_COLORS.TODO,
      },
    ];
    const circumference = 2 * Math.PI * 45;
    let offset = 0;
    const arcs = segments.map((s) => {
      const fraction = s.count / total;
      const length = fraction * circumference;
      const arc = {
        ...s,
        length,
        gap: circumference - length,
        offset,
        percent: Math.round(fraction * 100),
      };
      offset += length;
      return arc;
    });
    return { circumference, arcs };
  });

  // --------- Upcoming / recent lists ---------

  upcomingTasks = computed(() => {
    const now = Date.now();
    return this.myTasks()
      .filter((t) => t.status !== 'done' && t.dueDate)
      .map((t) => ({ task: t, due: this.toDate(t.dueDate!) }))
      .filter((x) => x.due.getTime() >= now - 24 * 60 * 60 * 1000)
      .sort((a, b) => a.due.getTime() - b.due.getTime())
      .slice(0, 6);
  });

  recentlyCompleted = computed(() => {
    return this.myTasks()
      .filter((t) => t.status === 'done' && t.completedAt)
      .map((t) => ({ task: t, at: this.toDate(t.completedAt!) }))
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 6);
  });

  // --------- Projects the user is part of ---------

  activeProjects = computed(() =>
    this.myProjects().filter((p) => p.status === 'active'),
  );
  archivedProjects = computed(() =>
    this.myProjects().filter((p) => p.status === 'archived'),
  );

  /**
   * Compute per-project contribution: counts of each task status for the
   * user, plus a last-activity timestamp. Ordered by most-active first so
   * the projects the user is currently focused on float to the top.
   */
  contributions = computed<ProjectContribution[]>(() => {
    const userId = this.user()?.uid;
    if (!userId) return [];
    const tasksByProject = new Map<string, Task[]>();
    for (const t of this.myTasks()) {
      const list = tasksByProject.get(t.projectId) ?? [];
      list.push(t);
      tasksByProject.set(t.projectId, list);
    }
    return this.myProjects()
      .map<ProjectContribution>((p) => {
        const tasks = tasksByProject.get(p.id) ?? [];
        const completed = tasks.filter((t) => t.status === 'done').length;
        const inProgress = tasks.filter((t) => t.status === 'in-progress').length;
        const todo = tasks.filter((t) => t.status === 'todo').length;
        const created = tasks.filter((t) => t.createdById === userId).length;
        const lastActivity = tasks
          .map((t) => this.toDateOrNull(t.updatedAt))
          .filter((d): d is Date => d !== null)
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
        const total = tasks.length;
        return {
          project: p,
          role: p.ownerId === userId ? 'Owner' : 'Member',
          totalMyTasks: total,
          completed,
          inProgress,
          todo,
          created,
          progress: total === 0 ? 0 : Math.round((completed / total) * 100),
          lastActivity,
        };
      })
      .sort((a, b) => {
        const at = a.lastActivity?.getTime() ?? 0;
        const bt = b.lastActivity?.getTime() ?? 0;
        if (bt !== at) return bt - at;
        return b.totalMyTasks - a.totalMyTasks;
      });
  });

  /**
   * Combined roster of people the user "reports to" — their direct manager
   * if set, plus owners of projects they're on. Dedupes on UID so a
   * manager who also owns a project only appears once (as Manager).
   */
  reportsToPeople = computed<ReportsToPerson[]>(() => {
    const user = this.user();
    if (!user) return [];
    const list: ReportsToPerson[] = [];
    const seen = new Set<string>();
    if (user.reportsToId) {
      list.push({
        uid: user.reportsToId,
        name: user.reportsToName || user.reportsToEmail || 'Manager',
        email: user.reportsToEmail,
        role: 'Manager',
      });
      seen.add(user.reportsToId);
    }
    for (const p of this.activeProjects()) {
      if (!p.ownerId || p.ownerId === user.uid || seen.has(p.ownerId)) continue;
      list.push({
        uid: p.ownerId,
        // We don't have the owner's profile here (Firestore rules block it
        // for non-admins); show the project name instead so the row is
        // still useful, and let the user hover for context.
        name: `Owner of "${p.name}"`,
        role: 'Project Owner',
        projectName: p.name,
      });
      seen.add(p.ownerId);
    }
    return list;
  });

  // --------- Manager edit ---------

  startEditReportsTo() {
    this.managerEmailInput.set(this.user()?.reportsToEmail ?? '');
    this.managerLookupError.set(null);
    this.editingReportsTo.set(true);
  }

  cancelEditReportsTo() {
    this.editingReportsTo.set(false);
    this.managerEmailInput.set('');
    this.managerLookupError.set(null);
  }

  async clearReportsTo() {
    this.reportsToChange.emit(null);
    this.cancelEditReportsTo();
  }

  /**
   * Attempt to resolve the entered email to a known user profile. If the
   * lookup succeeds, emit the profile upward for persistence. If it fails
   * (no matching user, Firestore rules blocking the read), we still save
   * the email as a plain string so the UI can at least display it.
   */
  async saveReportsTo() {
    const email = this.managerEmailInput().trim().toLowerCase();
    if (!email) {
      this.managerLookupError.set('Enter an email address.');
      return;
    }
    this.managerLookupBusy.set(true);
    this.managerLookupError.set(null);
    try {
      const manager = await this.findUserByEmail(email);
      if (manager) {
        this.reportsToChange.emit(manager);
      } else {
        // No profile found. Save what the user typed so the UI can show
        // "you report to X" even for users OmniTask has never seen.
        const stub: UserProfile = {
          uid: email,
          email,
          displayName: email,
          domain: email.split('@')[1] ?? 'unknown',
          role: 'user',
          createdAt: new Date(),
          lastLoginAt: new Date(),
        };
        this.reportsToChange.emit(stub);
      }
      this.cancelEditReportsTo();
    } catch (err) {
      this.managerLookupError.set(
        err instanceof Error ? err.message : 'Could not save manager',
      );
    } finally {
      this.managerLookupBusy.set(false);
    }
  }

  private async findUserByEmail(email: string): Promise<UserProfile | null> {
    // getAllUsers is only callable by admins (per Firestore rules). Non-admins
    // fall through to null, at which point we save the plain email instead.
    try {
      const users = await new Promise<UserProfile[]>((resolve, reject) => {
        const sub = this.userService.getAllUsers().subscribe({
          next: (v) => {
            resolve(v);
            sub.unsubscribe();
          },
          error: (e) => reject(e),
        });
      });
      return users.find((u) => u.email?.toLowerCase() === email) ?? null;
    } catch {
      return null;
    }
  }

  // --------- Style helpers ---------

  priorityDot(p: Task['priority']): string {
    return p === 'high' ? '#ff1493' : p === 'medium' ? '#e040fb' : '#00d2ff';
  }

  statusLabel(s: Task['status']): string {
    switch (s) {
      case 'done':
        return 'Done';
      case 'in-progress':
        return 'In Progress';
      default:
        return 'To Do';
    }
  }

  projectColor(p: Project): string {
    return p.color || this.defaultColor;
  }

  projectAvatar(p: Project): string {
    return p.name
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('') || '?';
  }

  personColor(uid: string): string {
    let h = 0;
    for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
    return ASSIGNEE_PALETTE[h % ASSIGNEE_PALETTE.length];
  }

  initials(name: string): string {
    return (
      name
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase())
        .join('')
        .slice(0, 2) || '?'
    );
  }

  isOverdue(task: Task): boolean {
    if (task.status === 'done' || !task.dueDate) return false;
    return this.toMillis(task.dueDate) < Date.now();
  }

  private toDate(value: unknown): Date {
    if (value instanceof Date) return value;
    if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate();
    }
    return new Date(value as string | number);
  }

  private toDateOrNull(value: unknown): Date | null {
    if (!value) return null;
    const d = this.toDate(value);
    return isNaN(d.getTime()) ? null : d;
  }

  private toMillis(value: unknown): number {
    return this.toDate(value).getTime();
  }
}

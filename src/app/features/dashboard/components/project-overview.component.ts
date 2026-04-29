import {
  Component,
  input,
  output,
  computed,
  signal,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  Project,
  Task,
  TaskViewMode,
  CYBERPUNK_COLORS,
  ASSIGNEE_PALETTE,
  DashboardWidgetKey,
  ALL_DASHBOARD_WIDGETS,
  DEFAULT_COMPLETION_GRADIENT,
  DEFAULT_DASHBOARD_STATUS_COLORS,
  DEFAULT_DASHBOARD_PRIORITY_COLORS,
  DEFAULT_DASHBOARD_STATUS_DISPLAY,
} from '../../../core/models/domain.model';

/** How far in the future a due date counts as "due soon" in the dashboard KPIs. */
const DUE_SOON_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
import { getColorWithOpacity } from '../../../core/utils/color.utils';
import { ProjectIconComponent } from '../../projects/components/project-icon.component';
import { SectionManagerComponent } from '../../projects/components/section-manager.component';
import { TagManagerComponent } from '../../projects/components/tag-manager.component';
import { ProjectMemberManagerComponent } from '../../projects/components/project-member-manager.component';
import { CustomFieldManagerComponent } from '../../projects/components/custom-field-manager/custom-field-manager.component';
import { DashboardPreferencesManagerComponent } from '../../projects/components/dashboard-preferences-manager.component';
import { AuthService } from '../../../core/auth/auth.service';

interface SectionStat {
  id: string;
  name: string;
  color: string;
  status?: Task['status'];
  wipLimit?: number | null;
  count: number;
  completed: number;
  progress: number;
}

interface AssigneeStat {
  id: string;
  name: string;
  total: number;
  completed: number;
  progress: number;
  color: string;
}

interface TagStat {
  id: string;
  name: string;
  color: string;
  count: number;
}

interface ActivityItem {
  task: Task;
  kind: 'created' | 'completed' | 'updated';
  when: Date;
}

@Component({
  selector: 'app-project-overview',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    ProjectIconComponent,
    SectionManagerComponent,
    TagManagerComponent,
    ProjectMemberManagerComponent,
    CustomFieldManagerComponent,
    DashboardPreferencesManagerComponent,
  ],
  templateUrl: './project-overview.component.html',
  styleUrls: ['./project-overview.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectOverviewComponent {
  readonly auth = inject(AuthService);

  project = input.required<Project>();
  tasks = input.required<Task[]>();

  taskClick = output<Task>();
  createTask = output<{ sectionId?: string; dueDate?: Date }>();
  editProject = output<Project>();
  viewModeChange = output<TaskViewMode>();

  // Which "manager" panel is expanded inline. Default to sections so users
  // immediately see the most common edit surface. Null collapses all.
  activePanel = signal<
    'sections' | 'tags' | 'members' | 'fields' | 'dashboard' | null
  >('sections');

  readonly defaultColor = CYBERPUNK_COLORS.TODO;

  /** Resolved status colors: project override → shared default. */
  statusColors = computed(() => {
    const override = this.project().dashboardPreferences?.statusColors ?? {};
    return {
      todo: override.todo || DEFAULT_DASHBOARD_STATUS_COLORS.todo,
      inProgress: override.inProgress || DEFAULT_DASHBOARD_STATUS_COLORS.inProgress,
      done: override.done || DEFAULT_DASHBOARD_STATUS_COLORS.done,
    };
  });

  /** Resolved priority colors: project override → shared default. */
  priorityColors = computed(() => {
    const override = this.project().dashboardPreferences?.priorityColors ?? {};
    return {
      high: override.high || DEFAULT_DASHBOARD_PRIORITY_COLORS.high,
      medium: override.medium || DEFAULT_DASHBOARD_PRIORITY_COLORS.medium,
      low: override.low || DEFAULT_DASHBOARD_PRIORITY_COLORS.low,
    };
  });

  /** Display style for the Status Breakdown widget. */
  statusDisplay = computed<'donut' | 'bars'>(
    () => this.project().dashboardPreferences?.statusDisplay ?? DEFAULT_DASHBOARD_STATUS_DISPLAY,
  );

  /**
   * Set of widget keys that should be rendered. We compute it once per
   * project change rather than re-scanning the visibleWidgets array on every
   * `showWidget()` call from the template (the template invokes it at least
   * once per dashboard panel and per surrounding `@if`).
   *
   * `undefined` means "no preference saved" → show all widgets. An explicit
   * empty array means "the admin hid every widget" → show none. We must keep
   * those two cases distinct, otherwise the manager UI's "hide everything"
   * state can never be persisted (the saved [] would be re-read as default).
   */
  private visibleWidgetSet = computed<ReadonlySet<DashboardWidgetKey>>(() => {
    const list = this.project().dashboardPreferences?.visibleWidgets;
    if (list === undefined) {
      return new Set(ALL_DASHBOARD_WIDGETS.map((w) => w.key));
    }
    return new Set(list);
  });

  /** Whether a given widget should be rendered for this project. */
  showWidget(key: DashboardWidgetKey): boolean {
    return this.visibleWidgetSet().has(key);
  }

  // ---------- Overall KPIs ----------
  totalTasks = computed(() => this.tasks().length);

  completedTasks = computed(
    () => this.tasks().filter((t) => t.status === 'done').length,
  );

  inProgressTasks = computed(
    () => this.tasks().filter((t) => t.status === 'in-progress').length,
  );

  todoTasks = computed(() => this.tasks().filter((t) => t.status === 'todo').length);

  overdueTasks = computed(() => {
    const now = new Date();
    return this.tasks().filter((t) => {
      if (t.status === 'done' || !t.dueDate) return false;
      return this.toDate(t.dueDate) < now;
    }).length;
  });

  dueSoonTasks = computed(() => {
    // Open tasks due within the DUE_SOON_WINDOW_MS window, not already overdue.
    const now = new Date();
    const soon = new Date(now.getTime() + DUE_SOON_WINDOW_MS);
    return this.tasks().filter((t) => {
      if (t.status === 'done' || !t.dueDate) return false;
      const d = this.toDate(t.dueDate);
      return d >= now && d <= soon;
    }).length;
  });

  unassignedTasks = computed(
    () => this.tasks().filter((t) => !(t.assigneeIds?.length)).length,
  );

  completionPercentage = computed(() => {
    const total = this.totalTasks();
    if (total === 0) return 0;
    return Math.round((this.completedTasks() / total) * 100);
  });

  // ---------- Status donut ----------
  statusBreakdown = computed(() => {
    const total = Math.max(this.totalTasks(), 1);
    const colors = this.statusColors();
    const segments = [
      {
        key: 'done' as const,
        label: 'Done',
        count: this.completedTasks(),
        color: colors.done,
      },
      {
        key: 'in-progress' as const,
        label: 'In Progress',
        count: this.inProgressTasks(),
        color: colors.inProgress,
      },
      {
        key: 'todo' as const,
        label: 'To Do',
        count: this.todoTasks(),
        color: colors.todo,
      },
    ];
    // Build stroke-dasharray arc segments over a circumference.
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

  // ---------- Priority bars ----------
  priorityBreakdown = computed(() => {
    const totals = { low: 0, medium: 0, high: 0 } as Record<
      'low' | 'medium' | 'high',
      number
    >;
    for (const t of this.tasks()) {
      totals[t.priority] = (totals[t.priority] ?? 0) + 1;
    }
    const total = Math.max(this.totalTasks(), 1);
    const colors = this.priorityColors();
    return [
      {
        key: 'high',
        label: 'High',
        color: colors.high,
        count: totals.high,
        percent: Math.round((totals.high / total) * 100),
      },
      {
        key: 'medium',
        label: 'Medium',
        color: colors.medium,
        count: totals.medium,
        percent: Math.round((totals.medium / total) * 100),
      },
      {
        key: 'low',
        label: 'Low',
        color: colors.low,
        count: totals.low,
        percent: Math.round((totals.low / total) * 100),
      },
    ];
  });

  // ---------- Per-section stats ----------
  sectionStats = computed<SectionStat[]>(() => {
    const sections = [...(this.project().sections ?? [])].sort(
      (a, b) => a.order - b.order,
    );
    return sections.map((s) => {
      const tasksInSection = this.tasks().filter((t) => t.sectionId === s.id);
      const done = tasksInSection.filter((t) => t.status === 'done').length;
      const count = tasksInSection.length;
      return {
        id: s.id,
        name: s.name,
        color: s.color || this.defaultColor,
        status: s.status,
        wipLimit: s.wipLimit,
        count,
        completed: done,
        progress: count === 0 ? 0 : Math.round((done / count) * 100),
      };
    });
  });

  // ---------- Top assignees ----------
  assigneeStats = computed<AssigneeStat[]>(() => {
    const map = new Map<string, AssigneeStat>();
    for (const t of this.tasks()) {
      const ids = t.assigneeIds ?? [];
      const names = t.assigneeNames ?? [];
      ids.forEach((id, i) => {
        const existing = map.get(id) ?? {
          id,
          name: names[i] || id,
          total: 0,
          completed: 0,
          progress: 0,
          color: this.hashColor(id),
        };
        existing.total += 1;
        if (t.status === 'done') existing.completed += 1;
        map.set(id, existing);
      });
    }
    const list = Array.from(map.values());
    for (const s of list) {
      s.progress = s.total === 0 ? 0 : Math.round((s.completed / s.total) * 100);
    }
    return list.sort((a, b) => b.total - a.total).slice(0, 6);
  });

  // ---------- Tag stats ----------
  tagStats = computed<TagStat[]>(() => {
    const project = this.project();
    const tags = project.tags ?? [];
    const counts = new Map<string, number>();
    for (const t of this.tasks()) {
      for (const tagRef of t.tags ?? []) {
        counts.set(tagRef, (counts.get(tagRef) ?? 0) + 1);
      }
    }
    return tags
      .map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        // Tags can be referenced by id or by name (legacy); count either match.
        count: (counts.get(tag.id) ?? 0) + (counts.get(tag.name) ?? 0),
      }))
      .sort((a, b) => b.count - a.count);
  });

  // ---------- Upcoming & recent activity ----------
  upcomingTasks = computed(() => {
    const now = new Date();
    return this.tasks()
      .filter((t) => t.status !== 'done' && t.dueDate)
      .map((t) => ({ task: t, due: this.toDate(t.dueDate!) }))
      .sort((a, b) => a.due.getTime() - b.due.getTime())
      .slice(0, 5);
  });

  recentActivity = computed<ActivityItem[]>(() => {
    const events: ActivityItem[] = [];
    for (const t of this.tasks()) {
      // Convert each timestamp at most once per task.
      const createdAt = t.createdAt ? this.toDate(t.createdAt) : null;
      if (createdAt) {
        events.push({ task: t, kind: 'created', when: createdAt });
      }
      if (t.status === 'done' && t.completedAt) {
        events.push({ task: t, kind: 'completed', when: this.toDate(t.completedAt) });
      } else if (t.updatedAt && createdAt) {
        const updatedAt = this.toDate(t.updatedAt);
        if (updatedAt.getTime() !== createdAt.getTime()) {
          events.push({ task: t, kind: 'updated', when: updatedAt });
        }
      }
    }
    return events.sort((a, b) => b.when.getTime() - a.when.getTime()).slice(0, 6);
  });

  // ---------- Style helpers ----------
  accent(alpha: number): string {
    return getColorWithOpacity(this.project().color || this.defaultColor, alpha);
  }

  /**
   * Static gradient for the completion bar. The stops sit at fixed positions
   * across the track so the palette stays the same regardless of completion %;
   * only the visible (non-clipped) portion changes. Honours the project's
   * dashboard preference, falling back to the cyber palette.
   */
  completionGradient(): string {
    const prefs = this.project().dashboardPreferences;
    const stops = prefs?.completionGradient?.length
      ? prefs.completionGradient
      : DEFAULT_COMPLETION_GRADIENT;
    return `linear-gradient(90deg, ${stops.join(', ')})`;
  }

  priorityDot(p: Task['priority']): string {
    const c = this.priorityColors();
    return p === 'high' ? c.high : p === 'medium' ? c.medium : c.low;
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

  statusColor(s: Task['status']): string {
    const c = this.statusColors();
    return s === 'done' ? c.done : s === 'in-progress' ? c.inProgress : c.todo;
  }

  isOverdue(task: Task): boolean {
    if (task.status === 'done' || !task.dueDate) return false;
    return this.toDate(task.dueDate) < new Date();
  }

  isOwner(): boolean {
    const uid = this.auth.currentUserSig()?.uid;
    return !!uid && this.project().ownerId === uid;
  }

  togglePanel(panel: 'sections' | 'tags' | 'members' | 'fields' | 'dashboard') {
    this.activePanel.set(this.activePanel() === panel ? null : panel);
  }

  /** Whether the current user can edit dashboard preferences. */
  canManageDashboard(): boolean {
    const user = this.auth.currentUserSig();
    if (!user) return false;
    return this.project().ownerId === user.uid || user.role === 'admin';
  }

  activityIcon(kind: ActivityItem['kind']): string {
    return kind === 'completed'
      ? 'M5 13l4 4L19 7'
      : kind === 'created'
        ? 'M12 4v16m8-8H4'
        : 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15';
  }

  activityColor(kind: ActivityItem['kind']): string {
    return kind === 'completed' ? '#10b981' : kind === 'created' ? '#00d2ff' : '#e040fb';
  }

  /**
   * Hash an arbitrary string (user id/email) to a stable color from the shared
   * ASSIGNEE_PALETTE so the same assignee always reads the same hue.
   */
  hashColor(key: string): string {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return ASSIGNEE_PALETTE[h % ASSIGNEE_PALETTE.length];
  }

  /** Convert a Firestore Timestamp, Date, or ISO-ish value into a Date. */
  private toDate(value: unknown): Date {
    if (value instanceof Date) return value;
    if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate();
    }
    return new Date(value as string | number);
  }

  getInitials(name: string): string {
    return (
      name
        .split(' ')
        .map((n) => n.charAt(0).toUpperCase())
        .join('')
        .slice(0, 2) || '?'
    );
  }

  /** Exposed for templates that need to feed a Firestore Timestamp into DatePipe. */
  asDate(value: unknown): Date | null {
    if (!value) return null;
    return this.toDate(value);
  }
}

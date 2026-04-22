import {
  Component,
  ChangeDetectionStrategy,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';

import { Project, Task, CYBERPUNK_COLORS } from '../../../core/models/domain.model';

type StatusFilter = 'all' | 'open' | 'todo' | 'in-progress' | 'done';

interface TaskGroup {
  projectId: string;
  projectName: string;
  projectColor: string;
  tasks: Task[];
}

const GROUP_ORDER_STORAGE_KEY = 'omnitask:myTasks:projectGroupOrder';

/**
 * Reorder `groups` so IDs that appear in `preferred` come first in that
 * relative order, followed by any groups the user hasn't yet positioned,
 * sorted by the `fallback` comparator (default: tasks-count descending).
 */
function applyPreferredOrder<T extends { projectId: string; tasks: readonly unknown[] }>(
  groups: T[],
  preferred: string[],
  fallback: (a: T, b: T) => number = (a, b) => b.tasks.length - a.tasks.length,
): T[] {
  if (preferred.length === 0) {
    return groups.slice().sort(fallback);
  }
  const byId = new Map(groups.map((g) => [g.projectId, g] as const));
  const ordered: T[] = [];
  const seen = new Set<string>();
  for (const id of preferred) {
    const g = byId.get(id);
    if (g) {
      ordered.push(g);
      seen.add(id);
    }
  }
  const leftovers = groups.filter((g) => !seen.has(g.projectId)).sort(fallback);
  return ordered.concat(leftovers);
}

/**
 * Fold the user's new visible-groups order into their stored preference
 * without forgetting IDs that aren't currently on screen (e.g. a project
 * the user filtered out). Visible IDs keep their new positions; absent
 * IDs keep their previous relative order appended at the end.
 */
function mergeOrders(visible: string[], previous: string[]): string[] {
  const visibleSet = new Set(visible);
  const tail = previous.filter((id) => !visibleSet.has(id));
  return visible.concat(tail);
}

/**
 * Compact, cross-project list of the user's tasks. Grouped by project so the
 * user can see at a glance where their workload sits. Groups ("sections")
 * are reorderable via drag-and-drop on the header, and the preferred order
 * is persisted per-browser so the layout sticks across sessions.
 */
@Component({
  selector: 'app-my-tasks-list',
  standalone: true,
  imports: [CommonModule, DatePipe, DragDropModule],
  templateUrl: './my-tasks-list.component.html',
  styleUrls: ['./my-tasks-list.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyTasksListComponent {
  tasks = input.required<Task[]>();
  projectsById = input.required<Map<string, Project>>();
  currentUserId = input.required<string>();

  taskClick = output<Task>();
  toggleComplete = output<Task>();
  createTaskInProject = output<string | null>();

  /** UI-side filter — hides done tasks by default so the list reflects work-in-flight. */
  statusFilter = signal<StatusFilter>('open');

  /** Text filter applied across title + project name. Empty means no filter. */
  search = signal('');

  /**
   * User-preferred order for the project-grouped "sections". Persisted in
   * localStorage and consulted when computing `groupedTasks`. Project IDs
   * not present here fall to the natural order (tasks-count descending).
   */
  groupOrder = signal<string[]>(this.loadGroupOrder());

  readonly defaultColor = CYBERPUNK_COLORS.TODO;

  filteredTasks = computed(() => {
    const filter = this.statusFilter();
    const query = this.search().trim().toLowerCase();
    const projects = this.projectsById();
    return this.tasks().filter((t) => {
      // Status filter first — cheapest short-circuit.
      switch (filter) {
        case 'open':
          if (t.status === 'done') return false;
          break;
        case 'todo':
          if (t.status !== 'todo') return false;
          break;
        case 'in-progress':
          if (t.status !== 'in-progress') return false;
          break;
        case 'done':
          if (t.status !== 'done') return false;
          break;
      }
      if (query) {
        const projectName = projects.get(t.projectId)?.name ?? '';
        const haystack = (t.title + ' ' + projectName).toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  });

  /**
   * Group filtered tasks by project. Projects with no matching tasks are
   * dropped from the view entirely so the list doesn't show empty sections.
   * Order: the user's saved drag-and-drop preference first (for IDs we
   * recognise), then remaining groups by tasks-count descending so busy
   * projects bubble up until the user drags them somewhere else.
   */
  groupedTasks = computed<TaskGroup[]>(() => {
    const projects = this.projectsById();
    const groups = new Map<string, TaskGroup>();
    for (const t of this.filteredTasks()) {
      const project = projects.get(t.projectId);
      const existing = groups.get(t.projectId) ?? {
        projectId: t.projectId,
        projectName: project?.name ?? 'Unknown project',
        projectColor: project?.color ?? this.defaultColor,
        tasks: [] as Task[],
      };
      existing.tasks.push(t);
      groups.set(t.projectId, existing);
    }
    return applyPreferredOrder(Array.from(groups.values()), this.groupOrder());
  });

  /**
   * Persist a new project-group ordering after the user drops a section
   * into a new slot. We record the IDs of the currently-visible groups
   * in their new order — unseen projects stay where their old preference
   * (if any) put them so the user's memory of the layout stays stable.
   */
  onGroupDrop(event: CdkDragDrop<TaskGroup[]>) {
    if (event.previousIndex === event.currentIndex) return;
    const groups = [...this.groupedTasks()];
    moveItemInArray(groups, event.previousIndex, event.currentIndex);
    const visibleIds = groups.map((g) => g.projectId);
    const next = mergeOrders(visibleIds, this.groupOrder());
    this.groupOrder.set(next);
    this.saveGroupOrder(next);
  }

  private loadGroupOrder(): string[] {
    try {
      const raw = globalThis.localStorage?.getItem(GROUP_ORDER_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }

  private saveGroupOrder(order: string[]): void {
    try {
      globalThis.localStorage?.setItem(GROUP_ORDER_STORAGE_KEY, JSON.stringify(order));
    } catch {
      // localStorage may be unavailable (private mode, quota, SSR). Drag
      // still works for the current session — persistence is a bonus.
    }
  }

  setFilter(f: StatusFilter) {
    this.statusFilter.set(f);
  }

  onSearch(v: string) {
    this.search.set(v);
  }

  priorityColor(p: Task['priority']): string {
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

  statusColor(s: Task['status']): string {
    return s === 'done' ? '#10b981' : s === 'in-progress' ? '#00d2ff' : '#e040fb';
  }

  isOverdue(task: Task): boolean {
    if (task.status === 'done' || !task.dueDate) return false;
    // Compare against the start of today, not `now` — a task due today
    // (00:00) should stay "due today" until the day rolls over, giving
    // the user until end-of-day to finish it.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return this.toMillis(task.dueDate) < startOfToday.getTime();
  }

  /**
   * Does the user author this task rather than (just) being assigned it?
   * Used to flag "Created by me" in the row caption so the user can
   * distinguish work they own from work handed to them.
   */
  isCreatorOnly(task: Task): boolean {
    const userId = this.currentUserId();
    if (!userId) return false;
    const isAssignee = task.assigneeIds?.includes(userId) || task.assignedToId === userId;
    return !isAssignee && task.createdById === userId;
  }

  asDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'object' && value !== null && 'toDate' in (value as object)) {
      const d = (value as { toDate: () => Date }).toDate();
      return d instanceof Date ? d : null;
    }
    if (typeof value === 'string') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  private toMillis(value: unknown): number {
    const d = this.asDate(value);
    return d ? d.getTime() : Number.POSITIVE_INFINITY;
  }
}

import {
  Component,
  ChangeDetectionStrategy,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';

import { Project, Task, CYBERPUNK_COLORS } from '../../../core/models/domain.model';

type StatusFilter = 'all' | 'open' | 'todo' | 'in-progress' | 'done';

interface TaskGroup {
  projectId: string;
  projectName: string;
  projectColor: string;
  tasks: Task[];
}

/**
 * Compact, cross-project list of the user's tasks. Grouped by project so the
 * user can see at a glance where their workload sits. Unlike the project
 * dashboard's list view, we don't drag/drop here — the focus is on triage
 * (mark done, open detail).
 */
@Component({
  selector: 'app-my-tasks-list',
  standalone: true,
  imports: [CommonModule, DatePipe],
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
   * Order: most tasks first so the user's busy projects surface at the top.
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
    return Array.from(groups.values()).sort((a, b) => b.tasks.length - a.tasks.length);
  });

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
    return this.toMillis(task.dueDate) < Date.now();
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

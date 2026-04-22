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
import { applyPreferredOrder, mergeOrders } from '../../../core/utils/order.utils';

interface AvailableGroup {
  projectId: string;
  projectName: string;
  projectColor: string;
  tasks: Task[];
}

const GROUP_ORDER_STORAGE_KEY = 'omnitask:available:projectGroupOrder';

/**
 * "Pick-up queue" for the My Tasks dashboard. Shows unassigned tasks across
 * every project the user is a member of, grouped by project, with a single
 * "Claim" action that self-assigns the current user to the task.
 */
@Component({
  selector: 'app-available-tasks',
  standalone: true,
  imports: [CommonModule, DatePipe, DragDropModule],
  templateUrl: './available-tasks.component.html',
  styleUrls: ['./available-tasks.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvailableTasksComponent {
  tasks = input.required<Task[]>();
  projectsById = input.required<Map<string, Project>>();

  taskClick = output<Task>();
  claim = output<Task>();

  /**
   * Tracks which task IDs are currently being claimed so we can disable the
   * button and show a spinner without bubbling up to the parent. Claims are
   * fast so this is really just to prevent double-clicks.
   */
  claiming = signal<Set<string>>(new Set());

  /**
   * User-preferred drag-and-drop order for the project-grouped sections.
   * Persisted in localStorage; absent project IDs fall back to the
   * tasks-count-descending default.
   */
  groupOrder = signal<string[]>(this.loadGroupOrder());

  readonly defaultColor = CYBERPUNK_COLORS.TODO;

  groupedTasks = computed<AvailableGroup[]>(() => {
    const projects = this.projectsById();
    const groups = new Map<string, AvailableGroup>();
    for (const t of this.tasks()) {
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
    // Sort tasks within each group: high priority first, then due date.
    const priorityOrder: Record<Task['priority'], number> = { high: 0, medium: 1, low: 2 };
    for (const g of groups.values()) {
      g.tasks.sort((a, b) => {
        const p = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (p !== 0) return p;
        return this.toMillis(a.dueDate) - this.toMillis(b.dueDate);
      });
    }
    const ordered = applyPreferredOrder(Array.from(groups.values()), this.groupOrder());
    return ordered;
  });

  onGroupDrop(event: CdkDragDrop<AvailableGroup[]>): void {
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
      // Drag still works for the current session — persistence is a bonus.
    }
  }

  async onClaim(task: Task) {
    // Optimistically mark as claiming so the button disables immediately.
    this.claiming.update((s) => new Set(s).add(task.id));
    try {
      this.claim.emit(task);
    } finally {
      // Parent will re-subscribe and the task will leave this list when the
      // Firestore write propagates; removing it here keeps the UI consistent
      // in the short window before that update lands.
      setTimeout(() => {
        this.claiming.update((s) => {
          const next = new Set(s);
          next.delete(task.id);
          return next;
        });
      }, 500);
    }
  }

  priorityLabel(p: Task['priority']): string {
    return p.charAt(0).toUpperCase() + p.slice(1);
  }

  priorityColor(p: Task['priority']): string {
    return p === 'high' ? '#ff1493' : p === 'medium' ? '#e040fb' : '#00d2ff';
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

import {
  Component,
  input,
  output,
  computed,
  signal,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Task, CustomFieldDefinition } from '../../core/models/domain.model';
import { TaskService } from '../../core/services/task.service';
import { ProjectService } from '../../core/services/project.service';
import { CustomFieldService } from '../../core/services/custom-field.service';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MarkdownPipe, MarkdownPlainPipe } from '../../shared/pipes/markdown.pipe';
import { formatPointValue } from '../../core/utils/point-scale.utils';
import { PointValueBadgeComponent } from './components/point-value-badge';

export interface TaskListViewNode extends Task {
  _depth: number;
}

@Component({
  selector: 'app-task-list-view',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    MarkdownPipe,
    MarkdownPlainPipe,
    PointValueBadgeComponent,
  ],
  templateUrl: './task-list-view.component.html',
  styleUrls: ['./task-list-view.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskListViewComponent {
  private readonly taskService = inject(TaskService);
  private readonly projectService = inject(ProjectService);
  private readonly customFieldService = inject(CustomFieldService);

  tasks = input.required<Task[]>();
  projectId = input.required<string>();
  googleTaskListId = input<string | undefined>(undefined);
  taskClick = output<Task>();
  delete = output<string>();

  // View mode toggle
  viewMode = signal<'simplified' | 'detailed'>('simplified');

  // Filter state - hide completed tasks older than 30 minutes by default
  showCompleted = signal(false);

  // Text search (client-side)
  searchQuery = signal('');

  // Selection mode for bulk actions
  selectionMode = signal(false);
  selectedTaskIds = signal<Set<string>>(new Set());

  // Expanding/collapsing tree nodes
  expandedTaskIds = signal<Set<string>>(new Set());

  project = toSignal(
    toObservable(this.projectId).pipe(
      switchMap((id) => (id ? this.projectService.getProject$(id) : of(null))),
    ),
    { initialValue: null },
  );

  globalFields = toSignal(this.customFieldService.getCustomFields(), { initialValue: [] });

  projectCustomFields = computed(() => {
    const ids = this.project()?.customFieldIds || [];
    return this.globalFields().filter((f: CustomFieldDefinition) => ids.includes(f.id));
  });

  gridTemplateCols = computed(() => {
    const fieldCount = this.projectCustomFields().length;
    const customFieldCols = Array(fieldCount).fill('120px').join(' ');
    const pointsCol = this.project()?.pointScaleConfig ? ' 120px' : '';
    if (this.selectionMode()) {
      return `auto auto 1fr 120px 120px 120px${pointsCol} ${customFieldCols} auto`;
    }
    return `auto 1fr 120px 120px 120px${pointsCol} ${customFieldCols} auto`;
  });

  // Make formatter available to the template.
  readonly formatPointValue = formatPointValue;

  // Track session start time to show recently completed tasks
  private sessionStartTime = new Date();

  sortField = signal<'title' | 'dueDate' | 'priority' | 'status'>('title');
  sortDirection = signal<'asc' | 'desc'>('asc');

  // Filter tasks based on completed status + text search
  filteredTasks = computed(() => {
    const allTasks = this.tasks();
    const q = this.searchQuery().trim().toLowerCase();

    const passSearch = (task: Task) => {
      if (!q) return true;
      const title = (task.title ?? '').toLowerCase();
      const desc = (task.description ?? '').toLowerCase();
      return title.includes(q) || desc.includes(q);
    };

    const searched = q ? allTasks.filter(passSearch) : allTasks;

    if (this.showCompleted()) {
      return searched; // Show all tasks (post-search)
    }

    const now = new Date();
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    return searched.filter((task) => {
      if (task.status !== 'done') return true; // Always show non-completed tasks

      // Show recently completed tasks (within 30 min or completed during this session)
      if (task.completedAt) {
        const completedAt = this.toDate(task.completedAt);
        return completedAt > thirtyMinutesAgo || completedAt > this.sessionStartTime;
      }

      // If no completedAt, check updatedAt
      if (task.updatedAt) {
        const updatedAt = this.toDate(task.updatedAt);
        return updatedAt > thirtyMinutesAgo;
      }

      return false; // Hide old completed tasks
    });
  });

  // Count hidden completed tasks
  hiddenCompletedCount = computed(() => {
    // If search is active, "hidden completed" becomes ambiguous; keep the old
    // meaning: items removed by the completed filter (not by search).
    if (this.searchQuery().trim()) return 0;
    return this.tasks().length - this.filteredTasks().length;
  });

  sortedTasks = computed(() => {
    const allTasks = this.filteredTasks();
    const field = this.sortField();
    const direction = this.sortDirection();
    const expanded = this.expandedTaskIds();

    const sortFn = (a: Task, b: Task) => {
      // Always keep completed tasks at the bottom to allow rapid completion
      // by clicking in the same spot repeatedly
      const aIsDone = a.status === 'done';
      const bIsDone = b.status === 'done';
      if (aIsDone !== bIsDone) {
        return aIsDone ? 1 : -1; // Done tasks go to bottom
      }

      let comparison = 0;

      switch (field) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'dueDate':
          const dA: any = a.dueDate;
          const dB: any = b.dueDate;
          const dateA = dA ? (dA.toDate ? dA.toDate() : new Date(dA)) : new Date(8640000000000000);
          const dateB = dB ? (dB.toDate ? dB.toDate() : new Date(dB)) : new Date(8640000000000000);
          comparison = dateA.getTime() - dateB.getTime();
          break;
        case 'priority':
          const priorityMap = { high: 3, medium: 2, low: 1 };
          comparison = priorityMap[a.priority] - priorityMap[b.priority];
          break;
        case 'status':
          const statusMap = { todo: 1, 'in-progress': 2, done: 3 };
          comparison = statusMap[a.status] - statusMap[b.status];
          break;
      }

      return direction === 'asc' ? comparison : -comparison;
    };

    /** Max recursion depth to prevent stack overflow from parentId cycles */
    const MAX_TREE_DEPTH = 20;
    const visited = new Set<string>();

    const flattenTree = (
      parentId: string | null | undefined,
      depth: number,
    ): TaskListViewNode[] => {
      if (depth > MAX_TREE_DEPTH) return [];

      const children = allTasks.filter((t) => (t.parentId || null) === (parentId || null));
      children.sort(sortFn);

      const result: TaskListViewNode[] = [];
      for (const child of children) {
        // Skip if already visited (cycle in parentId chain)
        if (visited.has(child.id)) continue;
        visited.add(child.id);

        result.push({ ...child, _depth: depth });
        // Only recurse if expanded
        if (expanded.has(child.id)) {
          result.push(...flattenTree(child.id, depth + 1));
        }
      }
      return result;
    };

    return flattenTree(null, 0);
  });

  hasSubtasks(taskId: string): boolean {
    return this.filteredTasks().some((t) => t.parentId === taskId);
  }

  toggleExpand(taskId: string, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.expandedTaskIds.update((set) => {
      const newSet = new Set(set);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  }

  isTaskBlocked(task: Task): boolean {
    if (!task.blockedByIds?.length) return false;
    const allTasks = this.tasks(); // use all tasks so we know true state even if filtered out
    return task.blockedByIds.some((id) => {
      const blocker = allTasks.find((t) => t.id === id);
      return blocker && blocker.status !== 'done';
    });
  }

  toggleShowCompleted() {
    this.showCompleted.update((v) => !v);
  }

  // Selection mode methods
  toggleSelectionMode() {
    this.selectionMode.update((v) => !v);
    if (!this.selectionMode()) {
      this.clearSelection();
    }
  }

  toggleTaskSelection(taskId: string) {
    this.selectedTaskIds.update((ids) => {
      const newIds = new Set(ids);
      if (newIds.has(taskId)) {
        newIds.delete(taskId);
      } else {
        newIds.add(taskId);
      }
      return newIds;
    });
  }

  isSelected(taskId: string): boolean {
    return this.selectedTaskIds().has(taskId);
  }

  clearSelection() {
    this.selectedTaskIds.set(new Set());
  }

  selectAllVisible() {
    if (this.allVisibleSelected()) {
      this.clearSelection();
    } else {
      const allIds = new Set(this.sortedTasks().map((t) => t.id));
      this.selectedTaskIds.set(allIds);
    }
  }

  allVisibleSelected(): boolean {
    const visibleTasks = this.sortedTasks();
    if (visibleTasks.length === 0) return false;
    return visibleTasks.every((t) => this.selectedTaskIds().has(t.id));
  }

  async bulkComplete() {
    const ids = Array.from(this.selectedTaskIds());
    if (ids.length === 0) return;

    // Use bulk update for efficiency
    await this.taskService.bulkUpdateTasks(ids, {
      status: 'done',
      completedAt: new Date(),
    });
    this.clearSelection();
  }

  async bulkReopen() {
    const ids = Array.from(this.selectedTaskIds());
    if (ids.length === 0) return;

    // Use bulk update for efficiency
    await this.taskService.bulkUpdateTasks(ids, {
      status: 'todo',
      completedAt: null,
    });
    this.clearSelection();
  }

  private toDate(dateValue: any): Date {
    if (dateValue instanceof Date) return dateValue;
    if (dateValue?.toDate) return dateValue.toDate();
    return new Date(dateValue);
  }

  toggleSort(field: 'title' | 'dueDate' | 'priority' | 'status') {
    if (this.sortField() === field) {
      this.sortDirection.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortField.set(field);
      this.sortDirection.set('asc');
    }
  }

  formatDate(date: any): string {
    if (!date) return '-';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  isOverdue(task: Task): boolean {
    if (task.status === 'done' || !task.dueDate) return false;
    const dateVal: any = task.dueDate;
    const due = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return due < now;
  }

  getCustomFieldValueLabel(task: Task, field: CustomFieldDefinition): string {
    const val = task.customFieldValues?.[field.id];
    if (val === undefined || val === null || val === '') return '-';

    switch (field.type) {
      case 'currency':
        return `${field.currencySymbol || '$'}${val}`;
      case 'date':
        return this.formatDate(val);
      case 'checkbox':
        return val ? 'Yes' : 'No';
      case 'multi-select':
        if (Array.isArray(val)) {
          return val.map((id) => field.options?.find((o) => o.id === id)?.label || id).join(', ');
        }
        return String(val);
      case 'status':
      case 'dropdown':
        const opt = field.options?.find((o) => o.id === val);
        return opt ? opt.label : String(val);
      case 'url':
        return String(val).replace(/^https?:\/\//, ''); // Clean URL
      default:
        return String(val);
    }
  }

  toggleCompletion(task: Task) {
    const googleTaskListId = this.googleTaskListId();
    if (task.status === 'done') {
      this.taskService.reopenTask(task.id, googleTaskListId);
    } else {
      this.taskService.completeTask(task.id, googleTaskListId);
    }
  }

  onDrop(event: CdkDragDrop<TaskListViewNode[]>) {
    const visible = event.container.data ?? this.sortedTasks();
    const prevIndex = event.previousIndex;
    const newIndex = event.currentIndex;
    if (prevIndex < 0 || newIndex < 0 || prevIndex === newIndex) return;

    const reordered = [...visible];
    moveItemInArray(reordered, prevIndex, newIndex);

    const ORDER_STEP = 1000;
    const updates = reordered.map((t, idx) => ({
      id: t.id,
      order: (idx + 1) * ORDER_STEP,
    }));

    void this.taskService.reorderTasks(updates);
  }
}

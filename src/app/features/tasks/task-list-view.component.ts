import { Component, input, output, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Task } from '../../core/models/domain.model';
import { TaskService } from '../../core/services/task.service';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { MarkdownPipe, MarkdownPlainPipe } from '../../shared/pipes/markdown.pipe';

@Component({
  selector: 'app-task-list-view',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, MarkdownPipe, MarkdownPlainPipe],
  templateUrl: './task-list-view.component.html',
  styles: [
    `
      .md-inline-title :is(p) {
        display: inline;
        margin: 0;
      }
      .md-inline-title :is(h1, h2, h3, h4, h5, h6) {
        display: inline;
        font-size: inherit;
        margin: 0;
      }
      .md-preview-content {
        max-height: 12rem;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(148, 163, 184, 0.2) transparent;
      }
      .md-preview-content :is(h1, h2, h3) {
        font-size: 0.8rem;
        margin: 0.25rem 0;
        font-weight: 600;
        color: #cbd5e1;
      }
      .md-preview-content p {
        margin: 0.15rem 0;
      }
      .md-preview-content ul,
      .md-preview-content ol {
        margin: 0.15rem 0;
        padding-left: 1rem;
      }
      .md-preview-content pre {
        font-size: 0.7rem;
        padding: 0.35rem 0.5rem;
        border-radius: 0.25rem;
        background: rgba(255, 255, 255, 0.03);
        margin: 0.25rem 0;
      }
      .md-preview-content code {
        font-size: 0.7rem;
      }
      .md-preview-content table {
        font-size: 0.7rem;
        margin: 0.25rem 0;
      }
      .md-preview-content .md-callout {
        font-size: 0.7rem;
        padding: 0.35rem 0.5rem;
        margin: 0.25rem 0;
      }
    `,
  ],
})
export class TaskListViewComponent {
  private taskService = inject(TaskService);

  tasks = input.required<Task[]>();
  googleTaskListId = input<string | undefined>(undefined);
  taskClick = output<Task>();
  delete = output<string>();

  // View mode toggle
  viewMode = signal<'simplified' | 'detailed'>('simplified');

  // Filter state - hide completed tasks older than 30 minutes by default
  showCompleted = signal(false);

  // Selection mode for bulk actions
  selectionMode = signal(false);
  selectedTaskIds = signal<Set<string>>(new Set());

  // Track session start time to show recently completed tasks
  private sessionStartTime = new Date();

  sortField = signal<'title' | 'dueDate' | 'priority' | 'status'>('title');
  sortDirection = signal<'asc' | 'desc'>('asc');

  // Filter tasks based on completed status
  filteredTasks = computed(() => {
    const allTasks = this.tasks();

    if (this.showCompleted()) {
      return allTasks; // Show all tasks
    }

    const now = new Date();
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    return allTasks.filter((task) => {
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
    return this.tasks().length - this.filteredTasks().length;
  });

  sortedTasks = computed(() => {
    const tasks = [...this.filteredTasks()];
    const field = this.sortField();
    const direction = this.sortDirection();

    return tasks.sort((a, b) => {
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
    });
  });

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

  toggleCompletion(task: Task) {
    const googleTaskListId = this.googleTaskListId();
    if (task.status === 'done') {
      this.taskService.reopenTask(task.id, googleTaskListId);
    } else {
      this.taskService.completeTask(task.id, googleTaskListId);
    }
  }

  onDrop(event: CdkDragDrop<Task[]>) {
    const prevIndex = this.tasks().findIndex((t) => t.id === event.item.data.id);
    const newIndex = event.currentIndex;
  }
}

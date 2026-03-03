import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Task } from '../../../core/models/domain.model';

/**
 * Project Statistics Card Component
 * Displays task counts, completion progress, and status breakdown
 */
@Component({
  selector: 'app-project-stats-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './project-stats-card.component.html',
  styleUrls: ['./project-stats-card.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectStatsCardComponent {
  tasks = input.required<Task[]>();

  totalTasks = computed(() => this.tasks().length);

  completedTasks = computed(() => this.tasks().filter((t) => t.status === 'done').length);

  inProgressTasks = computed(() => this.tasks().filter((t) => t.status === 'in-progress').length);

  todoTasks = computed(() => this.tasks().filter((t) => t.status === 'todo').length);

  overdueTasks = computed(() => {
    const now = new Date();
    return this.tasks().filter((t) => {
      if (t.status === 'done' || !t.dueDate) return false;
      const dueDate = t.dueDate instanceof Date ? t.dueDate : t.dueDate.toDate();
      return dueDate < now;
    }).length;
  });

  completionPercentage = computed(() => {
    const total = this.totalTasks();
    if (total === 0) return 0;
    return Math.round((this.completedTasks() / total) * 100);
  });
}

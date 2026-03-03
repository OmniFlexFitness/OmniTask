import { Component, input, computed } from '@angular/core';
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
  styles: [
    `
      :host {
        display: block;
      }

      .ofx-stats-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.75rem;
      }

      @media (min-width: 768px) {
        .ofx-stats-grid {
          grid-template-columns: repeat(4, 1fr);
        }
      }

      .ofx-stat-card {
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 0.75rem;
        padding: 0.75rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        transition: all 0.2s ease;
      }

      .ofx-stat-card:hover {
        border-color: rgba(0, 210, 255, 0.2);
        box-shadow: 0 0 20px rgba(0, 210, 255, 0.1);
      }

      .ofx-stat-icon {
        width: 2rem;
        height: 2rem;
        border-radius: 0.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .ofx-stat-content {
        display: flex;
        flex-direction: column;
      }

      .ofx-stat-value {
        font-size: 1.25rem;
        font-weight: 700;
        color: white;
        line-height: 1;
      }

      .ofx-stat-label {
        font-size: 0.65rem;
        color: rgb(148, 163, 184);
        margin-top: 0.125rem;
      }
    `,
  ],
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

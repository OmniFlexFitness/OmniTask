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
  template: `
    <div class="ofx-stats-grid">
      <!-- Total Tasks -->
      <div class="ofx-stat-card">
        <div class="ofx-stat-icon bg-cyan-500/20 text-cyan-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        <div class="ofx-stat-content">
          <span class="ofx-stat-value">{{ totalTasks() }}</span>
          <span class="ofx-stat-label">Total Tasks</span>
        </div>
      </div>

      <!-- Completed -->
      <div class="ofx-stat-card">
        <div class="ofx-stat-icon bg-emerald-500/20 text-emerald-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div class="ofx-stat-content">
          <span class="ofx-stat-value">{{ completedTasks() }}</span>
          <span class="ofx-stat-label">Completed</span>
        </div>
      </div>

      <!-- In Progress -->
      <div class="ofx-stat-card">
        <div class="ofx-stat-icon bg-amber-500/20 text-amber-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div class="ofx-stat-content">
          <span class="ofx-stat-value">{{ inProgressTasks() }}</span>
          <span class="ofx-stat-label">In Progress</span>
        </div>
      </div>

      <!-- Overdue -->
      <div class="ofx-stat-card">
        <div class="ofx-stat-icon bg-rose-500/20 text-rose-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <div class="ofx-stat-content">
          <span class="ofx-stat-value">{{ overdueTasks() }}</span>
          <span class="ofx-stat-label">Overdue</span>
        </div>
      </div>
    </div>

    <!-- Progress Bar -->
    <div class="mt-6">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-medium text-slate-300">Project Progress</span>
        <span class="text-sm font-bold text-cyan-400">{{ completionPercentage() }}%</span>
      </div>
      <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 rounded-full transition-all duration-500"
          [style.width.%]="completionPercentage()"
        ></div>
      </div>
      <div class="flex items-center justify-between mt-2 text-xs text-slate-500">
        <span>{{ completedTasks() }} of {{ totalTasks() }} tasks completed</span>
        @if (todoTasks() > 0) {
        <span>{{ todoTasks() }} to do</span>
        }
      </div>
    </div>
  `,
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

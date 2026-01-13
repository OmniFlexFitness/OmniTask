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
  styles: [
    `
      :host {
        display: block;
      }

      .ofx-stats-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
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
        padding: 1rem;
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
        width: 2.5rem;
        height: 2.5rem;
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
        font-size: 1.5rem;
        font-weight: 700;
        color: white;
        line-height: 1;
      }

      .ofx-stat-label {
        font-size: 0.75rem;
        color: rgb(148, 163, 184);
        margin-top: 0.25rem;
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

import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Timestamp } from '@angular/fire/firestore';
import { AuthService } from '../../core/auth/auth.service';
import { Task } from '../../core/models/domain.model';

const DEFAULT_PROJECT_ID = 'demo-project';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="max-w-7xl mx-auto py-10 px-4 lg:px-8 space-y-10">
      <header class="space-y-3 relative">
        <p class="ofx-section-title">Mission Control</p>
        <div class="absolute -bottom-2 left-0 h-[2px] w-32 bg-[#0073ff] opacity-80 shadow-[0_0_8px_rgba(0,115,255,0.7)]"></div>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 class="text-4xl font-black text-white tracking-tight">Dashboard</h1>
            <p class="text-slate-300">
              Welcome back, {{ auth.currentUserSig()?.displayName }}. Stay aligned with the OmniFlex flow.
            </p>
          </div>
          <div class="ofx-panel px-4 py-3 flex items-center gap-3">
            <span class="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_0_8px_rgba(16,185,129,0.15)]"></span>
            <div>
              <p class="text-[10px] uppercase tracking-[0.35em] text-cyan-200/70">Status</p>
              <p class="text-sm font-semibold text-white">Synced to OmniFlex Cloud</p>
            </div>
          </div>
        </div>
      </header>

      <section class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div class="ofx-panel p-6 bg-gradient-to-br from-slate-900/80 via-indigo-900/60 to-slate-900/80 border border-cyan-500/20 shadow-[0_0_25px_rgba(56,189,248,0.2)]">
          <p class="text-sm text-cyan-200/80">Open Tasks</p>
          <p class="mt-2 text-4xl font-bold text-white">{{ openTaskCount() }}</p>
          <p class="text-xs uppercase tracking-[0.25em] text-cyan-200/70 mt-3">Active</p>
        </div>
        <div class="ofx-panel p-6 bg-gradient-to-br from-slate-900/80 via-fuchsia-900/50 to-slate-900/80 border border-fuchsia-500/25 shadow-[0_0_25px_rgba(236,72,153,0.18)]">
          <p class="text-sm text-fuchsia-200/80">Due Soon</p>
          <p class="mt-2 text-4xl font-bold text-white">{{ dueSoonCount() }}</p>
          <p class="text-xs uppercase tracking-[0.25em] text-fuchsia-200/70 mt-3">Next 72 hours</p>
        </div>
        <div class="ofx-panel p-6 bg-gradient-to-br from-slate-900/80 via-emerald-900/40 to-slate-900/80 border border-emerald-500/25 shadow-[0_0_25px_rgba(52,245,197,0.15)]">
          <p class="text-sm text-emerald-200/80">Completed</p>
          <p class="mt-2 text-4xl font-bold text-white">{{ completedTaskCount() }}</p>
          <p class="text-xs uppercase tracking-[0.25em] text-emerald-200/70 mt-3">Cleared</p>
        </div>
      </section>

      <section class="ofx-panel divide-y divide-white/5">
        <div class="px-6 py-5 flex items-center justify-between flex-wrap gap-4">
          <div>
            <p class="ofx-section-title">Task Forge</p>
            <h2 class="text-xl font-semibold text-white">Create a Task</h2>
            <p class="text-sm text-slate-400">Capture the essentials to keep work moving.</p>
          </div>
          <button
            type="button"
            class="text-sm text-cyan-200/80 hover:text-white transition"
            *ngIf="editingTaskId()"
            (click)="resetForm()"
          >
            Cancel edit
          </button>
        </div>
        <form
          class="px-8 py-8 grid grid-cols-1 md:grid-cols-2 gap-6"
          [formGroup]="taskForm"
          (ngSubmit)="saveTask()"
        >
          <div class="col-span-1 md:col-span-2">
            <label class="block text-sm font-semibold text-slate-200">Title</label>
            <input
              type="text"
              formControlName="title"
              placeholder="Add a concise task title"
              class="mt-2 ofx-input"
              required
            />
          </div>
          <div class="col-span-1 md:col-span-2">
            <label class="block text-sm font-semibold text-slate-200">Description</label>
            <textarea
              rows="3"
              formControlName="description"
              placeholder="Add context, acceptance criteria, or links"
              class="mt-2 ofx-input"
            ></textarea>
          </div>

          <div>
            <label class="block text-sm font-semibold text-slate-200">Priority</label>
            <select
              formControlName="priority"
              class="mt-2 ofx-input"
            >
              <option *ngFor="let option of priorities" [value]="option">{{ option | titlecase }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-semibold text-slate-200">Status</label>
            <select
              formControlName="status"
              class="mt-2 ofx-input"
            >
              <option *ngFor="let state of statuses" [value]="state">{{ state | titlecase }}</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-semibold text-slate-200">Due date</label>
            <input
              type="date"
              formControlName="dueDate"
              class="mt-2 ofx-input"
            />
          </div>
          <div>
            <label class="block text-sm font-semibold text-slate-200">Assignee</label>
            <input
              type="text"
              formControlName="assigneeName"
              placeholder="Person responsible"
              class="mt-2 ofx-input"
            />
          </div>

          <div class="md:col-span-2">
            <label class="block text-sm font-semibold text-slate-200">Tags</label>
            <input
              type="text"
              formControlName="tags"
              placeholder="Comma-separated labels (e.g. frontend, client, backlog)"
              class="mt-2 ofx-input"
            />
          </div>

          <div class="md:col-span-2 flex justify-end gap-3 pt-2 flex-wrap">
            <button
              type="button"
              class="ofx-ghost-button"
              (click)="resetForm()"
            >
              Reset
            </button>
            <button
              type="submit"
              [disabled]="taskForm.invalid"
              class="ofx-gradient-button disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span class="relative z-10">{{ editingTaskId() ? 'Update Task' : 'Add Task' }}</span>
            </button>
          </div>
        </form>
      </section>

      <section class="ofx-panel">
        <div class="px-6 py-5 border-b border-white/5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p class="ofx-section-title">Active Streams</p>
            <h2 class="text-xl font-semibold text-white">Task list</h2>
            <p class="text-sm text-slate-400">Mark tasks as done, edit details, or remove them.</p>
          </div>
          <span class="text-sm text-slate-300">{{ tasks().length }} tasks</span>
        </div>
        <div class="divide-y divide-white/5" *ngIf="tasks().length; else emptyState">
          <article class="p-5 sm:p-6 hover:bg-white/5 hover:shadow-[0_0_25px_rgba(56,189,248,0.25)] transition border-b border-white/5 last:border-0" *ngFor="let task of tasks(); trackBy: trackTaskById">
            <div class="flex items-start justify-between gap-4 flex-wrap">
              <div class="space-y-2">
                <div class="flex items-center gap-3 flex-wrap">
                  <input
                    type="checkbox"
                    [checked]="task.status === 'done'"
                    (change)="toggleCompletion(task.id)"
                    class="h-4 w-4 text-cyan-400 border-white/20 rounded focus:ring-cyan-500/50 bg-slate-900"
                  />
                  <h3 class="text-lg font-semibold text-white" [class.line-through]="task.status === 'done'">
                    {{ task.title }}
                  </h3>
                  <span
                    class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full border border-white/10"
                    [ngClass]="getStatusBadgeClass(task.status)"
                  >
                    {{ task.status | titlecase }}
                  </span>
                  <span
                    class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full border border-white/10"
                    [ngClass]="getPriorityBadgeClass(task.priority)"
                  >
                    {{ task.priority | titlecase }} priority
                  </span>
                </div>
                <p class="text-sm text-slate-200/90" *ngIf="task.description">{{ task.description }}</p>
                <div class="flex flex-wrap items-center gap-3 text-sm text-slate-400">
                  <span *ngIf="task.assigneeName" class="inline-flex items-center gap-2">
                    <span class="h-2 w-2 bg-cyan-400 rounded-full"></span>
                    {{ task.assigneeName }}
                  </span>
                  <span *ngIf="task.dueDate" class="inline-flex items-center gap-2">
                    <span class="h-2 w-2 bg-slate-400 rounded-full"></span>
                    Due {{ formatDate(task.dueDate) }}
                  </span>
                  <ng-container *ngIf="task.tags?.length">
                    <span *ngFor="let tag of task.tags" class="ofx-chip bg-white/5 text-slate-100">
                      {{ tag }}
                    </span>
                  </ng-container>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <button class="text-sm text-cyan-200/80 hover:text-white transition" (click)="startEdit(task)">Edit</button>
                <button class="text-sm text-rose-300 hover:text-rose-200 transition" (click)="deleteTask(task.id)">Delete</button>
              </div>
            </div>
          </article>
        </div>
        <ng-template #emptyState>
          <div class="p-10 text-center text-slate-400">No tasks yet. Add one to get started.</div>
        </ng-template>
      </section>
    </div>
  `
})
export class DashboardComponent {
  auth = inject(AuthService);
  private fb = inject(FormBuilder);

  priorities: Task['priority'][] = ['low', 'medium', 'high'];
  statuses: Task['status'][] = ['todo', 'in-progress', 'done'];

  taskForm = this.fb.nonNullable.group({
    title: ['', Validators.required],
    description: [''],
    priority: ['medium' as Task['priority'], Validators.required],
    status: ['todo' as Task['status'], Validators.required],
    dueDate: [''],
    assigneeName: [''],
    tags: ['']
  });

  tasks = signal<Task[]>([
    {
      id: 'kickoff',
      projectId: DEFAULT_PROJECT_ID,
      title: 'Outline project milestones',
      description: 'Break work into milestones and identify owners for each phase.',
      assigneeName: 'You',
      status: 'in-progress',
      priority: 'high',
      dueDate: new Date(),
      tags: ['planning', 'team'],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'backlog-review',
      projectId: DEFAULT_PROJECT_ID,
      title: 'Review backlog tasks',
      description: 'Sort through incoming requests and clarify acceptance criteria.',
      status: 'todo',
      priority: 'medium',
      tags: ['backlog'],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ]);

  editingTaskId = signal<string | null>(null);

  openTaskCount = computed(() => this.tasks().filter(task => task.status !== 'done').length);
  completedTaskCount = computed(() => this.tasks().filter(task => task.status === 'done').length);
  dueSoonCount = computed(() =>
    this.tasks().filter(task => {
      if (!task.dueDate || task.status === 'done') {
        return false;
      }
      const due = this.convertToDate(task.dueDate);
      const now = new Date();
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(now.getDate() + 3);
      return due >= now && due <= threeDaysFromNow;
    }).length
  );

  saveTask() {
    if (this.taskForm.invalid) {
      return;
    }

    const formValue = this.taskForm.getRawValue();
    const tags = formValue.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);
    const dueDate = formValue.dueDate ? new Date(formValue.dueDate) : undefined;

    const newTask: Task = {
      id: this.editingTaskId() ?? crypto.randomUUID(),
      projectId: DEFAULT_PROJECT_ID,
      title: formValue.title,
      description: formValue.description,
      assigneeName: formValue.assigneeName || undefined,
      status: formValue.status,
      priority: formValue.priority,
      dueDate,
      tags,
      createdAt: this.editingTaskId()
        ? this.findTask(this.editingTaskId()!)?.createdAt ?? new Date()
        : new Date(),
      updatedAt: new Date()
    };

    if (this.editingTaskId()) {
      this.tasks.update(items =>
        items.map(task => (task.id === this.editingTaskId() ? { ...task, ...newTask } : task))
      );
    } else {
      this.tasks.update(items => [newTask, ...items]);
    }

    this.resetForm();
  }

  toggleCompletion(id: string) {
    this.tasks.update(items =>
      items.map(task =>
        task.id === id
          ? {
              ...task,
              status: task.status === 'done' ? 'in-progress' : 'done',
              updatedAt: new Date()
            }
          : task
      )
    );
  }

  trackTaskById(_: number, task: Task) {
    return task.id;
  }

  startEdit(task: Task) {
    this.editingTaskId.set(task.id);
    this.taskForm.patchValue({
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate ? this.toInputDate(task.dueDate) : '',
      assigneeName: task.assigneeName ?? '',
      tags: task.tags?.join(', ') ?? ''
    });
  }

  deleteTask(id: string) {
    this.tasks.update(items => items.filter(task => task.id !== id));
    if (this.editingTaskId() === id) {
      this.resetForm();
    }
  }

  resetForm() {
    this.editingTaskId.set(null);
    this.taskForm.reset({
      title: '',
      description: '',
      priority: 'medium',
      status: 'todo',
      dueDate: '',
      assigneeName: '',
      tags: ''
    });
  }

  formatDate(date: Date | string | number | Timestamp) {
    const parsedDate = this.convertToDate(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return 'Unknown date';
    }

    return parsedDate.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
  }

  private toInputDate(date: Date | string | number | Timestamp) {
    const parsedDate = this.convertToDate(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return '';
    }
    return parsedDate.toISOString().slice(0, 10);
  }

  private convertToDate(date: Date | string | number | Timestamp): Date {
    if (date instanceof Timestamp) {
      return date.toDate();
    }
    // Handle date-only strings to avoid timezone issues where 'YYYY-MM-DD' is parsed as UTC.
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Date(`${date}T00:00:00`);
    }
    return new Date(date);
  }

  private findTask(id: string) {
    return this.tasks().find(task => task.id === id);
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'todo':
        return 'bg-gray-800 text-gray-200 border-gray-700';
      case 'in-progress':
        return 'bg-blue-800 text-blue-200 border-blue-700';
      case 'done':
        return 'bg-emerald-800 text-emerald-200 border-emerald-700';
      default:
        return '';
    }
  }

  getPriorityBadgeClass(priority: string): string {
    switch (priority) {
      case 'low':
        return 'bg-gray-700 text-gray-100 border-gray-600';
      case 'medium':
        return 'bg-yellow-800 text-yellow-200 border-yellow-700';
      case 'high':
        return 'bg-rose-800 text-rose-200 border-rose-700';
      default:
        return '';
    }
  }
}

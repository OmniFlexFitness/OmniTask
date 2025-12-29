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
    <div class="py-6 space-y-8">
      <header class="glass-panel p-6 sm:p-8 space-y-6">
        <div class="flex items-center gap-3">
          <span class="accent-pill">
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-omni-glow opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-omni-glow"></span>
            </span>
            Live Workspace
          </span>
          <span class="omni-badge">OmniFlex</span>
        </div>
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div class="space-y-2">
            <h1 class="text-4xl font-bold text-white tracking-tight">OmniTask Mission Control</h1>
            <p class="text-slate-300 text-lg">Welcome back, {{ auth.currentUserSig()?.displayName }}. Align priorities and keep work flowing.</p>
          </div>
          <div class="flex gap-3 text-sm">
            <div class="glass-panel px-4 py-3">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-400">Open</p>
              <p class="text-2xl font-semibold text-white">{{ openTaskCount() }}</p>
            </div>
            <div class="glass-panel px-4 py-3">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-400">Due Soon</p>
              <p class="text-2xl font-semibold text-white">{{ dueSoonCount() }}</p>
            </div>
            <div class="glass-panel px-4 py-3">
              <p class="text-xs uppercase tracking-[0.2em] text-slate-400">Completed</p>
              <p class="text-2xl font-semibold text-white">{{ completedTaskCount() }}</p>
            </div>
          </div>
        </div>
      </header>

      <section class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div class="glass-panel p-5 space-y-2">
          <dt class="text-sm font-medium text-slate-300">Open Tasks</dt>
          <dd class="text-3xl font-semibold text-white">{{ openTaskCount() }}</dd>
          <p class="text-xs text-slate-500">Across active initiatives</p>
        </div>
        <div class="glass-panel p-5 space-y-2">
          <dt class="text-sm font-medium text-slate-300">Due Soon</dt>
          <dd class="text-3xl font-semibold text-white">{{ dueSoonCount() }}</dd>
          <p class="text-xs text-slate-500">Within the next 72 hours</p>
        </div>
        <div class="glass-panel p-5 space-y-2">
          <dt class="text-sm font-medium text-slate-300">Completed</dt>
          <dd class="text-3xl font-semibold text-white">{{ completedTaskCount() }}</dd>
          <p class="text-xs text-slate-500">Closed out tasks</p>
        </div>
      </section>

      <section class="glass-panel divide-y divide-white/5">
        <div class="px-4 py-5 sm:px-6 flex items-center justify-between">
          <div class="space-y-1">
            <h2 class="section-title">Create a Task</h2>
            <p class="text-sm text-slate-400">Capture the essentials to keep work moving.</p>
          </div>
          <button
            type="button"
            class="text-sm text-omni-glow hover:text-omni-fuchsia font-semibold"
            *ngIf="editingTaskId()"
            (click)="resetForm()"
          >
            Cancel edit
          </button>
        </div>
        <form
          class="px-4 py-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4"
          [formGroup]="taskForm"
          (ngSubmit)="saveTask()"
        >
          <div class="col-span-1 md:col-span-2">
            <label class="block text-sm font-medium text-slate-200">Title</label>
            <input
              type="text"
              formControlName="title"
              placeholder="Add a concise task title"
              class="mt-1 block w-full rounded-lg border-white/10 bg-omni-night/70 text-white placeholder:text-slate-500 focus:border-omni-glow focus:ring-omni-glow"
              required
            />
          </div>
          <div class="col-span-1 md:col-span-2">
            <label class="block text-sm font-medium text-slate-200">Description</label>
            <textarea
              rows="3"
              formControlName="description"
              placeholder="Add context, acceptance criteria, or links"
              class="mt-1 block w-full rounded-lg border-white/10 bg-omni-night/70 text-white placeholder:text-slate-500 focus:border-omni-glow focus:ring-omni-glow"
            ></textarea>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-200">Priority</label>
            <select
              formControlName="priority"
              class="mt-1 block w-full rounded-lg border-white/10 bg-omni-night/70 text-white focus:border-omni-glow focus:ring-omni-glow"
            >
              <option *ngFor="let option of priorities" [value]="option">{{ option | titlecase }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-200">Status</label>
            <select
              formControlName="status"
              class="mt-1 block w-full rounded-lg border-white/10 bg-omni-night/70 text-white focus:border-omni-glow focus:ring-omni-glow"
            >
              <option *ngFor="let state of statuses" [value]="state">{{ state | titlecase }}</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-slate-200">Due date</label>
            <input
              type="date"
              formControlName="dueDate"
              class="mt-1 block w-full rounded-lg border-white/10 bg-omni-night/70 text-white focus:border-omni-glow focus:ring-omni-glow"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-200">Assignee</label>
            <input
              type="text"
              formControlName="assigneeName"
              placeholder="Person responsible"
              class="mt-1 block w-full rounded-lg border-white/10 bg-omni-night/70 text-white placeholder:text-slate-500 focus:border-omni-glow focus:ring-omni-glow"
            />
          </div>

          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-slate-200">Tags</label>
            <input
              type="text"
              formControlName="tags"
              placeholder="Comma-separated labels (e.g. frontend, client, backlog)"
              class="mt-1 block w-full rounded-lg border-white/10 bg-omni-night/70 text-white placeholder:text-slate-500 focus:border-omni-glow focus:ring-omni-glow"
            />
          </div>

          <div class="md:col-span-2 flex justify-end gap-3 pt-2">
            <button
              type="button"
              class="px-4 py-2 rounded-lg text-sm font-medium text-slate-200 border border-white/10 hover:bg-white/5"
              (click)="resetForm()"
            >
              Reset
            </button>
            <button
              type="submit"
              [disabled]="taskForm.invalid"
              class="btn-gradient disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{{ editingTaskId() ? 'Update Task' : 'Add Task' }}</span>
            </button>
          </div>
        </form>
      </section>

      <section class="glass-panel">
        <div class="px-4 py-5 sm:px-6 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 class="section-title">Task list</h2>
            <p class="text-sm text-slate-400">Mark tasks as done, edit details, or remove them.</p>
          </div>
          <span class="text-sm text-slate-400">{{ tasks().length }} tasks</span>
        </div>
        <div class="divide-y divide-white/5" *ngIf="tasks().length; else emptyState">
          <article class="p-4 sm:p-6" *ngFor="let task of tasks(); trackBy: trackTaskById">
            <div class="flex items-start justify-between gap-4">
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <input
                    type="checkbox"
                    [checked]="task.status === 'done'"
                    (change)="toggleCompletion(task.id)"
                    class="h-4 w-4 text-omni-glow border-white/20 rounded focus:ring-omni-glow bg-omni-night"
                  />
                  <h3 class="text-lg font-semibold text-white" [class.line-through]="task.status === 'done'">
                    {{ task.title }}
                  </h3>
                  <span
                    class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full border"
                    [ngClass]="{
                      'bg-emerald-500/15 text-emerald-200 border-emerald-400/30': task.status === 'done',
                      'bg-amber-500/15 text-amber-200 border-amber-400/30': task.status === 'in-progress',
                      'bg-sky-500/15 text-sky-200 border-sky-400/30': task.status === 'todo'
                    }"
                  >
                    {{ task.status | titlecase }}
                  </span>
                  <span
                    class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full border"
                    [ngClass]="{
                      'bg-omni-rose/20 text-omni-rose border-omni-rose/40': task.priority === 'high',
                      'bg-orange-500/15 text-orange-200 border-orange-400/30': task.priority === 'medium',
                      'bg-slate-500/10 text-slate-200 border-slate-400/20': task.priority === 'low'
                    }"
                  >
                    {{ task.priority | titlecase }} priority
                  </span>
                </div>
                <p class="text-sm text-slate-300" *ngIf="task.description">{{ task.description }}</p>
                <div class="flex flex-wrap items-center gap-2 text-sm text-slate-400">
                  <span *ngIf="task.assigneeName" class="inline-flex items-center gap-1">
                    <span class="h-2 w-2 bg-omni-glow rounded-full"></span>
                    {{ task.assigneeName }}
                  </span>
                  <span *ngIf="task.dueDate" class="inline-flex items-center gap-1">
                    <span class="h-2 w-2 bg-slate-500 rounded-full"></span>
                    Due {{ formatDate(task.dueDate) }}
                  </span>
                  <ng-container *ngIf="task.tags?.length">
                    <span *ngFor="let tag of task.tags" class="px-2 py-0.5 bg-white/5 text-slate-200 border border-white/10 rounded-full text-xs">
                      {{ tag }}
                    </span>
                  </ng-container>
                </div>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <button class="text-omni-glow hover:text-omni-fuchsia font-semibold" (click)="startEdit(task)">Edit</button>
                <button class="text-omni-rose hover:text-omni-fuchsia font-semibold" (click)="deleteTask(task.id)">Delete</button>
              </div>
            </div>
          </article>
        </div>
        <ng-template #emptyState>
          <div class="p-8 text-center text-slate-400">No tasks yet. Add one to get started.</div>
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
}

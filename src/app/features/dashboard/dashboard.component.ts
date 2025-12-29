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
    <div class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div class="px-4 py-6 sm:px-0 space-y-8">
        <header class="flex flex-col gap-2">
          <h1 class="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p class="text-gray-600">Welcome back, {{ auth.currentUserSig()?.displayName }}</p>
        </header>

        <section class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div class="bg-white overflow-hidden shadow rounded-lg">
            <div class="px-4 py-5 sm:p-6">
              <dt class="text-sm font-medium text-gray-500 truncate">Open Tasks</dt>
              <dd class="mt-1 text-3xl font-semibold text-gray-900">{{ openTaskCount() }}</dd>
            </div>
          </div>
          <div class="bg-white overflow-hidden shadow rounded-lg">
            <div class="px-4 py-5 sm:p-6">
              <dt class="text-sm font-medium text-gray-500 truncate">Due Soon</dt>
              <dd class="mt-1 text-3xl font-semibold text-gray-900">{{ dueSoonCount() }}</dd>
            </div>
          </div>
          <div class="bg-white overflow-hidden shadow rounded-lg">
            <div class="px-4 py-5 sm:p-6">
              <dt class="text-sm font-medium text-gray-500 truncate">Completed</dt>
              <dd class="mt-1 text-3xl font-semibold text-gray-900">{{ completedTaskCount() }}</dd>
            </div>
          </div>
        </section>

        <section class="bg-white shadow rounded-lg divide-y divide-gray-200">
          <div class="px-4 py-5 sm:px-6 flex items-center justify-between">
            <div>
              <h2 class="text-lg font-medium text-gray-900">Create a Task</h2>
              <p class="text-sm text-gray-500">Capture the essentials to keep work moving.</p>
            </div>
            <button
              type="button"
              class="text-sm text-indigo-600 hover:text-indigo-500"
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
              <label class="block text-sm font-medium text-gray-700">Title</label>
              <input
                type="text"
                formControlName="title"
                placeholder="Add a concise task title"
                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                required
              />
            </div>
            <div class="col-span-1 md:col-span-2">
              <label class="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                rows="3"
                formControlName="description"
                placeholder="Add context, acceptance criteria, or links"
                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              ></textarea>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700">Priority</label>
              <select
                formControlName="priority"
                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option *ngFor="let option of priorities" [value]="option">{{ option | titlecase }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Status</label>
              <select
                formControlName="status"
                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option *ngFor="let state of statuses" [value]="state">{{ state | titlecase }}</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700">Due date</label>
              <input
                type="date"
                formControlName="dueDate"
                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Assignee</label>
              <input
                type="text"
                formControlName="assigneeName"
                placeholder="Person responsible"
                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>

            <div class="md:col-span-2">
              <label class="block text-sm font-medium text-gray-700">Tags</label>
              <input
                type="text"
                formControlName="tags"
                placeholder="Comma-separated labels (e.g. frontend, client, backlog)"
                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>

            <div class="md:col-span-2 flex justify-end gap-3 pt-2">
              <button
                type="button"
                class="px-4 py-2 rounded-md text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50"
                (click)="resetForm()"
              >
                Reset
              </button>
              <button
                type="submit"
                [disabled]="taskForm.invalid"
                class="px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {{ editingTaskId() ? 'Update Task' : 'Add Task' }}
              </button>
            </div>
          </form>
        </section>

        <section class="bg-white shadow rounded-lg">
          <div class="px-4 py-5 sm:px-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 class="text-lg font-medium text-gray-900">Task list</h2>
              <p class="text-sm text-gray-500">Mark tasks as done, edit details, or remove them.</p>
            </div>
            <span class="text-sm text-gray-500">{{ tasks().length }} tasks</span>
          </div>
          <div class="divide-y divide-gray-200" *ngIf="tasks().length; else emptyState">
            <article class="p-4 sm:p-6" *ngFor="let task of tasks(); trackBy: trackTaskById">
              <div class="flex items-start justify-between gap-4">
                <div class="space-y-1">
                  <div class="flex items-center gap-2">
                    <input
                      type="checkbox"
                      [checked]="task.status === 'done'"
                      (change)="toggleCompletion(task.id)"
                      class="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <h3 class="text-lg font-semibold text-gray-900" [class.line-through]="task.status === 'done'">
                      {{ task.title }}
                    </h3>
                    <span
                      class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                      [ngClass]="{
                        'bg-green-100 text-green-800': task.status === 'done',
                        'bg-yellow-100 text-yellow-800': task.status === 'in-progress',
                        'bg-blue-100 text-blue-800': task.status === 'todo'
                      }"
                    >
                      {{ task.status | titlecase }}
                    </span>
                    <span
                      class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                      [ngClass]="{
                        'bg-red-100 text-red-800': task.priority === 'high',
                        'bg-orange-100 text-orange-800': task.priority === 'medium',
                        'bg-gray-100 text-gray-800': task.priority === 'low'
                      }"
                    >
                      {{ task.priority | titlecase }} priority
                    </span>
                  </div>
                  <p class="text-sm text-gray-700" *ngIf="task.description">{{ task.description }}</p>
                  <div class="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                    <span *ngIf="task.assigneeName" class="inline-flex items-center gap-1">
                      <span class="h-2 w-2 bg-indigo-500 rounded-full"></span>
                      {{ task.assigneeName }}
                    </span>
                    <span *ngIf="task.dueDate" class="inline-flex items-center gap-1">
                      <span class="h-2 w-2 bg-gray-400 rounded-full"></span>
                      Due {{ formatDate(task.dueDate) }}
                    </span>
                    <ng-container *ngIf="task.tags?.length">
                      <span *ngFor="let tag of task.tags" class="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs">
                        {{ tag }}
                      </span>
                    </ng-container>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <button class="text-sm text-indigo-600 hover:text-indigo-500" (click)="startEdit(task)">Edit</button>
                  <button class="text-sm text-red-600 hover:text-red-500" (click)="deleteTask(task.id)">Delete</button>
                </div>
              </div>
            </article>
          </div>
          <ng-template #emptyState>
            <div class="p-8 text-center text-gray-500">No tasks yet. Add one to get started.</div>
          </ng-template>
        </section>
      </div>
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
      if (!due) {
        return false;
      }
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

  formatDate(date: Date | string | number | Timestamp | null | undefined) {
    const parsedDate = this.convertToDate(date);
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
      return 'Unknown date';
    }

    return parsedDate.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
  }

  private toInputDate(date: Date | string | number | Timestamp | null | undefined) {
    const parsedDate = this.convertToDate(date);
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
      return '';
    }
    return parsedDate.toISOString().slice(0, 10);
  }

  private convertToDate(date: Date | string | number | Timestamp | null | undefined): Date | null {
    if (date === null || date === undefined) {
      return null;
    }
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

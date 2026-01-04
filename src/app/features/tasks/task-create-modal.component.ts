import { Component, input, output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TaskService } from '../../core/services/task.service';
import { ProjectService } from '../../core/services/project.service';
import { Task, Project, Section } from '../../core/models/domain.model';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';

@Component({
  selector: 'app-task-create-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div 
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
      (click)="onBackdropClick($event)"
    >
      <div 
        class="w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
        (click)="$event.stopPropagation()"
      >
        <!-- Header -->
        <header class="px-6 py-4 border-b border-fuchsia-500/20 bg-[#0a0f1e]/90">
          <h2 class="text-lg font-bold text-white flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            New Task
          </h2>
        </header>

        <!-- Body -->
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="p-6 space-y-5">
          <!-- Title -->
          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Task Name *</label>
            <input
              type="text"
              formControlName="title"
              placeholder="What needs to be done?"
              class="w-full bg-slate-950/50 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              autofocus
            />
            @if (form.controls.title.touched && form.controls.title.invalid) {
              <p class="text-xs text-rose-400 mt-1">Task name is required</p>
            }
          </div>

          <!-- Description -->
          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Description</label>
            <textarea
              formControlName="description"
              rows="3"
              placeholder="Add more details..."
              class="w-full bg-slate-950/50 border border-white/10 rounded-lg px-4 py-3 text-slate-300 placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors resize-none"
            ></textarea>
          </div>

          <!-- Two Column Grid -->
          <div class="grid grid-cols-2 gap-4">
            <!-- Priority -->
            <div>
              <label class="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Priority</label>
              <select
                formControlName="priority"
                class="w-full bg-slate-950/50 border border-white/10 rounded-lg px-4 py-2.5 text-slate-300 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              >
                <option value="low">🟢 Low</option>
                <option value="medium">🟡 Medium</option>
                <option value="high">🔴 High</option>
              </select>
            </div>

            <!-- Due Date -->
            <div>
              <label class="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Due Date</label>
              <input
                type="date"
                formControlName="dueDate"
                class="w-full bg-slate-950/50 border border-white/10 rounded-lg px-4 py-2.5 text-slate-300 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              />
            </div>
          </div>

          <!-- Section (for Board view) -->
          @if (sections().length > 0) {
            <div>
              <label class="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Section</label>
              <select
                formControlName="sectionId"
                class="w-full bg-slate-950/50 border border-white/10 rounded-lg px-4 py-2.5 text-slate-300 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              >
                @for (section of sections(); track section.id) {
                  <option [value]="section.id">{{ section.name }}</option>
                }
              </select>
            </div>
          }

          <!-- Assignee -->
          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Assignee</label>
            <input
              type="text"
              formControlName="assigneeName"
              placeholder="Who is responsible?"
              class="w-full bg-slate-950/50 border border-white/10 rounded-lg px-4 py-2.5 text-slate-300 placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
            />
          </div>

          <!-- Tags -->
          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Tags</label>
            <input
              type="text"
              formControlName="tags"
              placeholder="Comma separated (e.g. urgent, frontend)"
              class="w-full bg-slate-950/50 border border-white/10 rounded-lg px-4 py-2.5 text-slate-300 placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
            />
          </div>

          <!-- Actions -->
          <div class="flex justify-end gap-3 pt-4 border-t border-white/5">
            <button
              type="button"
              class="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              (click)="close.emit()"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              [disabled]="form.invalid || saving()"
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    @keyframes scaleIn {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    .animate-scale-in {
      animation: scaleIn 0.2s ease-out;
    }

    .ofx-gradient-button {
        background-image: linear-gradient(to right, #00c6ff 0%, #0072ff 51%, #00c6ff 100%);
        background-size: 200% auto;
        border: none;
        border-radius: 0.5rem;
        color: white;
        cursor: pointer;
        padding: 0.75rem 1.5rem;
        text-align: center;
        text-transform: uppercase;
        transition: 0.5s;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.875rem;
        font-weight: 600;
    }

    .ofx-gradient-button:hover {
        background-position: right center;
    }

    .ofx-gradient-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
  `]
})
export class TaskCreateModalComponent {
  private fb = inject(FormBuilder);
  private taskService = inject(TaskService);
  private projectService = inject(ProjectService);

  // Inputs
  projectId = input.required<string>();
  initialSectionId = input<string | null>(null);
  initialDueDate = input<Date | null>(null);

  // Outputs
  close = output<void>();
  created = output<Task>();

  // State
  saving = signal(false);

  // Get project sections for dropdown
  project = toSignal(
    toObservable(this.projectId).pipe(
      switchMap(id => id ? this.projectService.getProject$(id) : of(null))
    ),
    { initialValue: null }
  );

  sections = signal<Section[]>([]);

  form = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    priority: ['medium'],
    dueDate: [''],
    sectionId: [''],
    assigneeName: [''],
    tags: ['']
  });

  constructor() {
    // Load sections when project changes
    toObservable(this.project).subscribe(p => {
      if (p?.sections) {
        this.sections.set(p.sections);
        // Set default section if provided or first section
        const initialSection = this.initialSectionId() || (p.sections.length > 0 ? p.sections[0].id : '');
        this.form.patchValue({ sectionId: initialSection });
      }
    });

    // Set initial due date if provided
    toObservable(this.initialDueDate).subscribe(date => {
      if (date) {
        this.form.patchValue({ dueDate: this.toInputDate(date) });
      }
    });
  }

  async onSubmit() {
    if (this.form.invalid) return;

    this.saving.set(true);

    try {
      const val = this.form.value;
      const dueDate = val.dueDate ? new Date(val.dueDate) : undefined;
      const tags = val.tags ? val.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

      const taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> = {
        projectId: this.projectId(),
        title: val.title!,
        description: val.description || '',
        status: 'todo',
        priority: val.priority as Task['priority'],
        order: 0, // Will be assigned properly
        sectionId: val.sectionId || undefined,
        assigneeName: val.assigneeName || undefined,
        dueDate: dueDate as any,
        tags
      };

      const ref = await this.taskService.createTask(taskData);

      // Emit the created task
      const newTask: Task = {
        id: ref.id,
        ...taskData,
        createdAt: new Date() as any,
        updatedAt: new Date() as any
      };

      this.created.emit(newTask);
      this.close.emit();
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      this.saving.set(false);
    }
  }

  onBackdropClick(e: Event) {
    if (e.target === e.currentTarget) {
      this.close.emit();
    }
  }

  private toInputDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}

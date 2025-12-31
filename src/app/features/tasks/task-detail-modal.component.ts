import { Component, input, output, computed, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TaskService } from '../../core/services/task.service';
import { ProjectService } from '../../core/services/project.service';
import { Task, Project } from '../../core/models/domain.model';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';

@Component({
  selector: 'app-task-detail-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div 
      class="fixed inset-0 z-50 flex items-center justify-end sm:justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-sm transition-all"
      (click)="onExampleClick($event)"
    >
      <div 
        class="w-full h-full sm:h-auto sm:max-w-2xl bg-slate-900 border-l sm:border border-white/10 sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-in-right"
        (click)="$event.stopPropagation()"
      >
        <!-- Header -->
        <header class="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-slate-800/20">
          <div class="flex items-center gap-3">
             <button 
               class="p-1 rounded-md border text-xs font-bold uppercase tracking-wide transition-colors"
               [ngClass]="{
                 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20': task()?.status === 'done',
                 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10': task()?.status !== 'done'
               }"
               (click)="toggleComplete()"
             >
               @if (task()?.status === 'done') {
                 <span class="flex items-center gap-1">
                   <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                     <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                   </svg>
                   Completed
                 </span>
               } @else {
                 <span class="flex items-center gap-1">
                   <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                   </svg>
                   Mark Complete
                 </span>
               }
             </button>
          </div>

          <div class="flex items-center gap-2">
            <!-- Delete -->
            <button 
              class="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
              title="Delete Task"
              (click)="deleteTask()"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            
            <!-- Close -->
            <button 
              class="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              (click)="close.emit()"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto px-6 py-6" [formGroup]="form">
          <!-- Title -->
          <div class="mb-6">
            <textarea
              formControlName="title"
              rows="1"
              placeholder="Task title"
              class="w-full bg-transparent border-none text-2xl font-bold text-white placeholder-slate-600 focus:ring-0 resize-none overflow-hidden"
              (input)="autoResize($event.target)"
              (blur)="autoSave()"
              (keydown.enter)="$event.preventDefault()"
            ></textarea>
          </div>

          <!-- Metadata Grid -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 mb-8">
            <!-- Assignee -->
            <div class="flex flex-col gap-1">
              <label class="text-xs font-semibold text-slate-500 uppercase tracking-widest">Assignee</label>
              <input
                type="text"
                formControlName="assigneeName"
                placeholder="Unassigned"
                class="bg-transparent border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                (blur)="autoSave()"
              />
            </div>

            <!-- Due Date -->
            <div class="flex flex-col gap-1">
              <label class="text-xs font-semibold text-slate-500 uppercase tracking-widest">Due Date</label>
              <input
                type="date"
                formControlName="dueDate"
                class="bg-transparent border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                (blur)="autoSave()"
              />
            </div>

            <!-- Priority -->
            <div class="flex flex-col gap-1">
              <label class="text-xs font-semibold text-slate-500 uppercase tracking-widest">Priority</label>
              <select
                formControlName="priority"
                class="bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                (change)="autoSave()"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <!-- Project/Section -->
            <div class="flex flex-col gap-1">
               <label class="text-xs font-semibold text-slate-500 uppercase tracking-widest">Section</label>
               <select
                 formControlName="sectionId"
                 class="bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                 (change)="autoSave()"
               >
                 <option [value]="null">No Section</option>
                 @for (section of projectSections(); track section.id) {
                   <option [value]="section.id">{{ section.name }}</option>
                 }
               </select>
            </div>
          </div>

          <!-- Description -->
          <div class="mb-6">
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Description</label>
            <textarea
              formControlName="description"
              rows="6"
              placeholder="Add more details to this task..."
              class="w-full bg-slate-950/30 border border-white/10 rounded-xl p-4 text-slate-300 placeholder-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors resize-y leading-relaxed"
              (blur)="autoSave()"
            ></textarea>
          </div>
          
          <!-- Tags (simple text input for now) -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">Tags</label>
             <input
                type="text"
                formControlName="tags"
                placeholder="Comma separated tags..."
                class="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                (blur)="autoSave()"
              />
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    @keyframes slideInRight {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    .animate-slide-in-right {
      animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    
    /* Responsive adjustment for mobile: slide up */
    @media (max-width: 640px) {
      @keyframes slideUp {
        from { transform: translateY(100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .animate-slide-in-right {
        animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
    }
  `]
})
export class TaskDetailModalComponent {
  private fb = inject(FormBuilder);
  private taskService = inject(TaskService);
  private projectService = inject(ProjectService);

  // Input
  task = input<Task | null>(null);
  
  // project ID needed to fetch sections
  projectId = input<string | null>(null);

  // Output
  close = output<void>();
  updated = output<Task>();
  deleted = output<string>();

  // Derived project signal
  project = toSignal(
    toObservable(this.projectId).pipe(
      switchMap(id => id ? this.projectService.getProject$(id) : of(null))
    ),
    { initialValue: null }
  );

  projectSections = computed(() => {
     return this.project()?.sections || [];
  });
  
  form = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    assigneeName: [''],
    dueDate: [''],
    priority: ['medium'],
    sectionId: [null as string | null],
    tags: ['']
  });

  constructor() {
    // Sync form with task input
    effect(() => {
      const task = this.task();
      if (task) {
        this.form.patchValue({
          title: task.title,
          description: task.description,
          assigneeName: task.assigneeName || '',
          dueDate: task.dueDate ? this.toInputDate(task.dueDate) : '',
          priority: task.priority,
          sectionId: task.sectionId || null,
          tags: task.tags?.join(', ') || ''
        }, { emitEvent: false });
      }
    });
  }
  
  autoResize(element: any) {
    element.style.height = 'auto';
    element.style.height = element.scrollHeight + 'px';
  }

  async autoSave() {
    const task = this.task();
    if (!task || this.form.invalid || !this.form.dirty) return;

    const val = this.form.value;
    const dueDate = val.dueDate ? new Date(val.dueDate) : undefined;
    const tags = val.tags ? val.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];

    const updates: Partial<Task> = {
      title: val.title!,
      description: val.description || '',
      assigneeName: val.assigneeName || undefined,
      dueDate,
      priority: val.priority as Task['priority'],
      sectionId: val.sectionId || undefined, // or delete field if null? Firestore merge ignores undefined usually or needs FieldValue.delete()
      tags
    };

    // Clean undefined for Firestore if needed, but AngularFire handles it well mostly.
    // However, explicit FieldValue.delete() is safer for removal.
    // For now, let's just pass values.

    try {
      await this.taskService.updateTask(task.id, updates);
      // Emit updated task optimistically
      this.updated.emit({ ...task, ...updates } as Task);
    } catch (e) {
      console.error('Auto-save failed', e);
    }
  }

  async toggleComplete() {
    const task = this.task();
    if (!task) return;

    if (task.status === 'done') {
      await this.taskService.reopenTask(task.id);
      this.updated.emit({ ...task, status: 'in-progress' }); // Optimistic
    } else {
      await this.taskService.completeTask(task.id);
      this.updated.emit({ ...task, status: 'done' }); // Optimistic
    }
  }

  async deleteTask() {
    const task = this.task();
    if (!task || !confirm('Are you sure you want to delete this task?')) return;

    await this.taskService.deleteTask(task.id);
    this.deleted.emit(task.id);
    this.close.emit();
  }

  onExampleClick(e: Event) {
    if (e.target === e.currentTarget) {
        this.close.emit();
    }
  }
  
  private toInputDate(date: any): string {
    if (!date) return '';
    try {
        const d = date.toDate ? date.toDate() : new Date(date);
        return d.toISOString().split('T')[0];
    } catch {
        return '';
    }
  }
}

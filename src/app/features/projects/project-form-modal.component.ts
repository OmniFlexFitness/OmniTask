import { Component, inject, signal, Output, EventEmitter, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ProjectService } from '../../core/services/project.service';
import { Project } from '../../core/models/domain.model';

/**
 * Project colors for selection
 */
const PROJECT_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#0ea5e9', // Sky
  '#00d2ff', // Cyan (OmniFlex accent)
];

@Component({
  selector: 'app-project-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div 
      class="ofx-modal-overlay"
      (click)="onOverlayClick($event)"
    >
      <div class="ofx-modal" (click)="$event.stopPropagation()">
        <header class="ofx-modal-header">
          <h2 class="text-xl font-bold text-white">
            {{ editProject() ? 'Edit Project' : 'New Project' }}
          </h2>
          <button class="ofx-icon-button" (click)="close.emit()">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <form [formGroup]="form" (ngSubmit)="submit()" class="ofx-modal-body space-y-5">
          <!-- Project Name -->
          <div>
            <label class="block text-sm font-semibold text-slate-200 mb-2">Project Name</label>
            <input
              type="text"
              formControlName="name"
              placeholder="e.g., Product Launch, Marketing Q1"
              class="ofx-input"
              autofocus
            />
          </div>

          <!-- Description -->
          <div>
            <label class="block text-sm font-semibold text-slate-200 mb-2">Description</label>
            <textarea
              formControlName="description"
              rows="3"
              placeholder="What is this project about?"
              class="ofx-input"
            ></textarea>
          </div>

          <!-- Color Selection -->
          <div>
            <label class="block text-sm font-semibold text-slate-200 mb-3">Project Color</label>
            <div class="flex flex-wrap gap-2">
              @for (color of colors; track color) {
                <button
                  type="button"
                  class="ofx-color-swatch"
                  [class.selected]="form.value.color === color"
                  [style.background]="color"
                  [style.box-shadow]="form.value.color === color ? '0 0 0 2px rgba(255,255,255,0.9), 0 0 16px ' + color : '0 0 8px ' + color + '60'"
                  (click)="form.patchValue({ color })"
                  [title]="color"
                ></button>
              }
            </div>
          </div>
        </form>

        <footer class="ofx-modal-footer">
          <button
            type="button"
            class="ofx-ghost-button"
            (click)="close.emit()"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="ofx-gradient-button"
            [disabled]="form.invalid || saving()"
            (click)="submit()"
          >
            @if (saving()) {
              <span class="flex items-center gap-2">
                <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </span>
            } @else {
              {{ editProject() ? 'Save Changes' : 'Create Project' }}
            }
          </button>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    .ofx-modal-overlay {
      @apply fixed inset-0 z-50 flex items-center justify-center p-4;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      animation: fadeIn 0.2s ease-out;
    }

    .ofx-modal {
      @apply w-full max-w-lg rounded-2xl overflow-hidden;
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.95));
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 
        0 0 0 1px rgba(0, 210, 255, 0.1),
        0 25px 50px rgba(0, 0, 0, 0.5),
        0 0 40px rgba(0, 210, 255, 0.15);
      animation: slideUp 0.25s ease-out;
    }

    .ofx-modal-header {
      @apply flex items-center justify-between px-6 py-5 border-b border-white/10;
      background: linear-gradient(90deg, rgba(56, 189, 248, 0.05), transparent);
    }

    .ofx-modal-body {
      @apply px-6 py-6;
    }

    .ofx-modal-footer {
      @apply flex justify-end gap-3 px-6 py-4 border-t border-white/10;
      background: rgba(0, 0, 0, 0.2);
    }

    .ofx-icon-button {
      @apply p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all;
    }

    .ofx-color-swatch {
      @apply w-8 h-8 rounded-lg transition-all duration-200 cursor-pointer;
      border: 2px solid transparent;
    }

    .ofx-color-swatch:hover {
      transform: scale(1.1);
    }

    .ofx-color-swatch.selected {
      transform: scale(1.15);
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from { 
        opacity: 0;
        transform: translateY(20px) scale(0.95);
      }
      to { 
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
  `]
})
export class ProjectFormModalComponent {
  private projectService = inject(ProjectService);
  private fb = inject(FormBuilder);

  // Input for editing an existing project
  editProject = input<Project | null>(null);

  // Outputs
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<Project>();

  // Color options
  colors = PROJECT_COLORS;

  // Form group
  form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(1)]],
    description: [''],
    color: ['#6366f1']
  });

  // Loading state
  saving = signal(false);

  ngOnInit() {
    const project = this.editProject();
    if (project) {
      this.form.patchValue({
        name: project.name,
        description: project.description || '',
        color: project.color || '#6366f1'
      });
    }
  }

  onOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }

  async submit() {
    if (this.form.invalid) return;

    this.saving.set(true);

    try {
      const { name, description, color } = this.form.getRawValue();
      const editingProject = this.editProject();

      if (editingProject) {
        // Update existing project
        await this.projectService.updateProject(editingProject.id, {
          name,
          description,
          color
        });
        this.saved.emit({ ...editingProject, name, description, color });
      } else {
        // Create new project
        const docRef = await this.projectService.createProject(name, description, color);
        const newProject = await this.projectService.getProject(docRef.id);
        if (newProject) {
          this.saved.emit(newProject);
        }
      }
      
      this.close.emit();
    } catch (error) {
      console.error('Failed to save project:', error);
    } finally {
      this.saving.set(false);
    }
  }
}

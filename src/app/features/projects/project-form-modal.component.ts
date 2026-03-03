import { Component, inject, signal, output, input, ChangeDetectionStrategy } from '@angular/core';
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
  templateUrl: './project-form-modal.component.html',
  styleUrls: ['./project-form-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectFormModalComponent {
  private readonly projectService = inject(ProjectService);
  private readonly fb = inject(FormBuilder);

  // Input for editing an existing project
  editProject = input<Project | null>(null);

  // Outputs
  close = output<void>();
  saved = output<Project>();

  // Color options
  colors = PROJECT_COLORS;

  // Form group
  form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(1)]],
    description: [''],
    color: ['#6366f1'],
  });

  // Loading state
  saving = signal(false);

  ngOnInit() {
    const project = this.editProject();
    if (project) {
      this.form.patchValue({
        name: project.name,
        description: project.description || '',
        color: project.color || '#6366f1',
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
          color,
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

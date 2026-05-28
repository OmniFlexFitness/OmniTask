import {
  Component,
  inject,
  signal,
  output,
  input,
  ChangeDetectionStrategy, OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ProjectService } from '../../core/services/project.service';
import {
  StorageService,
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
} from '../../core/services/storage.service';
import { Project } from '../../core/models/domain.model';
import { ProjectIconComponent } from './components/project-icon.component';

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
  imports: [CommonModule, ReactiveFormsModule, ProjectIconComponent],
  templateUrl: './project-form-modal.component.html',
  styleUrls: ['./project-form-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectFormModalComponent implements OnInit {
  private readonly projectService = inject(ProjectService);
  private readonly storageService = inject(StorageService);
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

  // Icon state: kept outside the FormGroup because it can be a pending File,
  // an uploaded URL, or null (cleared).
  iconPreview = signal<string | null>(null);
  pendingIconFile = signal<File | null>(null);
  iconError = signal<string | null>(null);
  iconCleared = signal(false);

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
      if (project.icon) {
        this.iconPreview.set(project.icon);
      }
    }
  }

  onOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }

  onIconFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.iconError.set(null);

    // Quick client-side validation mirroring StorageService rules so we fail
    // fast and show a preview without uploading.
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      this.iconError.set('Unsupported image type. Use PNG, JPEG, WEBP, GIF, or SVG.');
      input.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      this.iconError.set('Image is too large (max 4 MB).');
      input.value = '';
      return;
    }

    this.pendingIconFile.set(file);
    this.iconCleared.set(false);

    const reader = new FileReader();
    reader.onload = () => {
      this.iconPreview.set(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.readAsDataURL(file);
    // Reset input so selecting the same file again still triggers change.
    input.value = '';
  }

  clearIcon() {
    this.iconPreview.set(null);
    this.pendingIconFile.set(null);
    this.iconCleared.set(true);
    this.iconError.set(null);
  }

  /** Fake project for the live preview tile while editing. */
  previewProject(): Project {
    const raw = this.form.getRawValue();
    const existing = this.editProject();
    return {
      ...(existing || ({} as Project)),
      id: existing?.id ?? 'preview',
      name: raw.name || existing?.name || 'New Project',
      color: raw.color,
      icon: this.iconPreview() ?? undefined,
    } as Project;
  }

  async submit() {
    if (this.form.invalid) return;

    this.saving.set(true);
    this.iconError.set(null);

    try {
      const { name, description, color } = this.form.getRawValue();
      const editingProject = this.editProject();

      if (editingProject) {
        // Upload new icon if the user picked one, otherwise preserve or clear.
        // We isolate the upload step in its own try/catch so a Storage failure
        // (rules misconfig, network blip, oversized file) doesn't masquerade
        // as a generic "Failed to save project" — and the rest of the form
        // (name, description, color) still saves successfully.
        let iconUrl: string | undefined = editingProject.icon;
        let iconUploadFailed = false;
        const pending = this.pendingIconFile();
        if (pending) {
          try {
            iconUrl = await this.storageService.uploadProjectIcon(editingProject.id, pending);
            // Best-effort cleanup of previous icon (swallows errors internally).
            if (editingProject.icon && editingProject.icon !== iconUrl) {
              void this.storageService.deleteByUrl(editingProject.icon);
            }
          } catch (err) {
            iconUploadFailed = true;
            iconUrl = editingProject.icon; // keep prior icon
            console.error('Icon upload failed:', err);
            this.iconError.set('Failed to upload icon. Please try again.');
          }
        } else if (this.iconCleared()) {
          if (editingProject.icon) {
            void this.storageService.deleteByUrl(editingProject.icon);
          }
          iconUrl = undefined;
        }

        const updates: Partial<Project> = { name, description, color };
        if (pending && !iconUploadFailed) {
          updates.icon = iconUrl;
        }
        await this.projectService.updateProject(editingProject.id, updates);
        if (!pending && this.iconCleared()) {
          // Remove the icon field entirely rather than persisting a sentinel.
          await this.projectService.clearProjectIcon(editingProject.id);
        }
        // If the icon upload failed, keep the modal open so the user sees the
        // specific error and can retry without losing their other edits. We
        // also withhold the `saved` event because parents (e.g. the dashboard)
        // close the modal in their `(saved)` handler — emitting here would
        // dismiss the dialog and hide the upload error.
        if (iconUploadFailed) {
          return;
        }
        this.saved.emit({ ...editingProject, ...updates, icon: iconUrl } as Project);
      } else {
        // Create project first so we have an ID to scope the storage path,
        // then upload the icon and patch the project.
        const docRef = await this.projectService.createProject(name, description, color);
        const pending = this.pendingIconFile();
        if (pending) {
          try {
            const iconUrl = await this.storageService.uploadProjectIcon(docRef.id, pending);
            await this.projectService.updateProject(docRef.id, { icon: iconUrl });
          } catch (err) {
            console.error('Icon upload failed (project was created):', err);
            this.iconError.set('Failed to upload project icon. Please try again.');
          }
        }
        const newProject = await this.projectService.getProject(docRef.id);
        if (newProject) {
          this.saved.emit(newProject);
        }
      }

      this.close.emit();
    } catch (error) {
      console.error('Failed to save project:', error);
      this.iconError.set('Failed to save project. Please try again.');
    } finally {
      this.saving.set(false);
    }
  }
}

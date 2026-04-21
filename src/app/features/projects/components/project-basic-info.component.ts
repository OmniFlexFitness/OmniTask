import {
  Component,
  input,
  output,
  inject,
  signal,
  ChangeDetectionStrategy,
  OnInit,
  OnChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../core/services/project.service';
import { StorageService } from '../../../core/services/storage.service';
import { Project } from '../../../core/models/domain.model';
import { ProjectIconComponent } from './project-icon.component';

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
  selector: 'app-project-basic-info',
  standalone: true,
  imports: [CommonModule, FormsModule, ProjectIconComponent],
  templateUrl: './project-basic-info.component.html',
  styleUrls: ['./project-basic-info.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectBasicInfoComponent implements OnInit, OnChanges {
  private readonly projectService = inject(ProjectService);
  private readonly storageService = inject(StorageService);

  iconUploading = signal(false);
  iconError = signal<string | null>(null);

  project = input.required<Project>();
  projectChanged = output<void>();

  colors = PROJECT_COLORS;

  // Edit state
  editName = '';
  editDescription = '';
  saving = signal(false);

  hasBasicChanges = signal(false);
  private previousProjectId: string | null = null;

  ngOnInit() {
    this.resetBasicInfo();
  }

  ngOnChanges() {
    const currentId = this.project().id;
    const projectSwitched = this.previousProjectId !== null && this.previousProjectId !== currentId;
    this.previousProjectId = currentId;

    if (projectSwitched || !this.hasBasicChanges()) {
      this.resetBasicInfo();
    }
  }

  resetBasicInfo() {
    this.editName = this.project().name;
    this.editDescription = this.project().description || '';
    this.hasBasicChanges.set(false);
  }

  onNameChange(event: Event) {
    this.editName = (event.target as HTMLInputElement).value;
    this.checkBasicChanges();
  }

  onDescriptionChange(event: Event) {
    this.editDescription = (event.target as HTMLTextAreaElement).value;
    this.checkBasicChanges();
  }

  checkBasicChanges() {
    const hasChanges =
      this.editName !== this.project().name ||
      this.editDescription !== (this.project().description || '');
    this.hasBasicChanges.set(hasChanges);
  }

  async onIconFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.iconError.set(null);
    this.iconUploading.set(true);
    const previous = this.project().icon;
    try {
      const url = await this.storageService.uploadProjectIcon(this.project().id, file);
      await this.projectService.updateProject(this.project().id, { icon: url });
      if (previous && previous !== url) {
        void this.storageService.deleteByUrl(previous);
      }
      this.projectChanged.emit();
    } catch (err) {
      console.error('Icon upload failed:', err);
      this.iconError.set(err instanceof Error ? err.message : 'Icon upload failed.');
    } finally {
      this.iconUploading.set(false);
    }
  }

  async clearIcon() {
    const previous = this.project().icon;
    if (!previous) return;
    this.iconError.set(null);
    try {
      // Setting null removes the icon for our UI (truthy checks) while keeping
      // Firestore happy (it rejects undefined but accepts null).
      await this.projectService.updateProject(this.project().id, {
        icon: null as unknown as string,
      });
      void this.storageService.deleteByUrl(previous);
      this.projectChanged.emit();
    } catch (err) {
      console.error('Failed to clear icon:', err);
      this.iconError.set(err instanceof Error ? err.message : 'Failed to clear icon.');
    }
  }

  async updateColor(color: string) {
    try {
      await this.projectService.updateProject(this.project().id, { color });
      this.projectChanged.emit();
    } catch (error) {
      console.error('Failed to update color:', error);
    }
  }

  async saveBasicInfo() {
    if (!this.editName.trim()) return;

    this.saving.set(true);
    try {
      await this.projectService.updateProject(this.project().id, {
        name: this.editName.trim(),
        description: this.editDescription.trim(),
      });
      this.hasBasicChanges.set(false);
      this.projectChanged.emit();
    } catch (error) {
      console.error('Failed to save project:', error);
    } finally {
      this.saving.set(false);
    }
  }
}

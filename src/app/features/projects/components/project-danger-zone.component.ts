import { Component, input, output, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectService } from '../../../core/services/project.service';
import { DialogService } from '../../../core/services/dialog.service';
import { Project } from '../../../core/models/domain.model';

@Component({
  selector: 'app-project-danger-zone',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './project-danger-zone.component.html',
  styleUrls: ['./project-danger-zone.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDangerZoneComponent {
  private readonly projectService = inject(ProjectService);
  private readonly dialogService = inject(DialogService);

  project = input.required<Project>();
  projectChanged = output<void>();
  projectDeleted = output<void>();

  async toggleArchive() {
    const project = this.project();
    const action = project.status === 'active' ? 'archive' : 'restore';

    if (
      await this.dialogService.confirm(
        `Are you sure you want to ${action} this project?`,
        `${action === 'archive' ? 'Archive' : 'Restore'} Project`,
      )
    ) {
      try {
        if (project.status === 'active') {
          await this.projectService.archiveProject(project.id);
        } else {
          await this.projectService.restoreProject(project.id);
        }
        this.projectChanged.emit();
      } catch (error) {
        console.error(`Failed to ${action} project:`, error);
      }
    }
  }

  async confirmDelete() {
    const confirmed = await this.dialogService.confirm(
      `Are you sure you want to DELETE "${
        this.project().name
      }"?\n\nThis will permanently remove the project and ALL its tasks. This action cannot be undone.`,
      'Delete Project',
    );

    if (confirmed) {
      try {
        await this.projectService.deleteProject(this.project().id);
        this.projectDeleted.emit();
      } catch (error) {
        console.error('Failed to delete project:', error);
      }
    }
  }
}

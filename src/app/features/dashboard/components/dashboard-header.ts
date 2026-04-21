import { Component, input, output, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Project, TaskViewMode, CYBERPUNK_COLORS } from '../../../core/models/domain.model';
import { AuthService } from '../../../core/auth/auth.service';
import { getColorWithOpacity } from '../../../core/utils/color.utils';
import { ProjectIconComponent } from '../../projects/components/project-icon.component';

@Component({
  selector: 'app-dashboard-header',
  standalone: true,
  imports: [CommonModule, RouterLink, ProjectIconComponent],
  templateUrl: './dashboard-header.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardHeaderComponent {
  readonly auth = inject(AuthService);
  readonly defaultColor = CYBERPUNK_COLORS.TODO;

  currentProject = input<Project | null>(null);
  viewMode = input<TaskViewMode>('list');
  syncing = input<boolean>(false);

  showFieldManager = output<void>();
  editProjectModal = output<Project>();
  viewModeChange = output<TaskViewMode>();
  openCreateTaskModal = output<void>();
  syncGoogleTasks = output<void>();
  toggleSidebar = output<void>();

  getColorWithOpacity(color: string | undefined, alpha: number): string {
    return getColorWithOpacity(color, alpha);
  }
}

import { Component, input, output, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Project, TaskViewMode } from '../../../core/models/domain.model';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-dashboard-header',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard-header.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardHeaderComponent {
  readonly auth = inject(AuthService);

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
    const hex = color || '#e040fb';
    const parsed = hex.replace('#', '');
    if (parsed.length !== 6) {
      return `rgba(224, 64, 251, ${alpha})`;
    }
    const r = parseInt(parsed.substring(0, 2), 16);
    const g = parseInt(parsed.substring(2, 4), 16);
    const b = parseInt(parsed.substring(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      return `rgba(224, 64, 251, ${alpha})`;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}

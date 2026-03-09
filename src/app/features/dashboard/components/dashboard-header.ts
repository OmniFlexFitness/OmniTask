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
  auth = inject(AuthService);

  currentProject = input<Project | null>(null);
  viewMode = input<TaskViewMode>('list');
  syncing = input<boolean>(false);

  showFieldManager = output<void>();
  editProjectModal = output<Project>();
  viewModeChange = output<TaskViewMode>();
  openCreateTaskModal = output<void>();
  syncGoogleTasks = output<void>();
}

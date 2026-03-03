import { Component, inject, signal, Output, EventEmitter, input, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectService } from '../../core/services/project.service';
import { SeedDataService } from '../../core/services/seed-data.service';
import { Project } from '../../core/models/domain.model';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-project-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './project-sidebar.component.html',
  styles: [
    `
      .ofx-sidebar {
        background: #050810;
        border-right: 1px solid rgba(0, 210, 255, 0.15);
        backdrop-filter: blur(16px);
        position: relative;
      }

      .ofx-sidebar::before {
        content: '';
        position: absolute;
        top: 0;
        right: 0;
        width: 1px;
        height: 100%;
        background: rgba(0, 210, 255, 0.3);
        box-shadow: 0 0 10px rgba(0, 210, 255, 0.2);
      }

      .ofx-icon-button {
        @apply p-2 rounded-lg text-cyan-400 hover:text-white hover:bg-cyan-500/10 transition-all duration-200;
        position: relative;
      }

      .ofx-icon-button:hover {
        box-shadow: 0 0 15px rgba(0, 210, 255, 0.4);
      }

      .ofx-project-item {
        border-left: 3px solid transparent;
        position: relative;
        transition: all 0.3s ease;
      }

      .ofx-project-item::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
        background: var(--cyber-purple);
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .ofx-project-item:hover {
        background: rgba(224, 64, 251, 0.08);
        border-left-color: transparent;
      }

      .ofx-project-item:hover::before {
        opacity: 0.5;
      }

      .ofx-project-item.active {
        background: rgba(224, 64, 251, 0.12);
        border-left-color: transparent;
        box-shadow: inset 0 0 30px rgba(224, 64, 251, 0.1);
      }

      .ofx-project-item.active::before {
        opacity: 1;
        box-shadow: 0 0 10px rgba(224, 64, 251, 0.5);
      }

      .ofx-project-item.active span:first-child {
        animation: pulse-glow 2s ease-in-out infinite;
      }

      @keyframes pulse-glow {
        0%,
        100% {
          opacity: 1;
          filter: brightness(1);
        }
        50% {
          opacity: 0.8;
          filter: brightness(1.3);
        }
      }
    `,
  ],
})
export class ProjectSidebarComponent {
  private projectService = inject(ProjectService);
  private seedService = inject(SeedDataService);

  // Input for currently selected project
  selectedProjectId = input<string | null>(null);

  // Output event when project is selected
  @Output() projectSelected = new EventEmitter<Project>();

  // Projects from service
  projects = toSignal(this.projectService.getMyProjects(), { initialValue: [] });

  // UI state
  showCreateForm = signal(false);
  seeding = signal(false);

  constructor() {
    effect(() => {
      const projectList = this.projects();
      // If there's no selected project ID but there are projects, select the first one.
      if (!this.selectedProjectId() && projectList && projectList.length > 0) {
        this.selectProject(projectList[0]);
      }
    });
  }

  selectProject(project: Project) {
    this.projectService.selectedProjectId.set(project.id);
    this.projectSelected.emit(project);
  }

  async createProject(name: string) {
    if (!name.trim()) return;

    try {
      const docRef = await this.projectService.createProject(name.trim());
      // Select the newly created project
      const newProject = await this.projectService.getProject(docRef.id);
      if (newProject) {
        this.selectProject(newProject);
      }
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  }

  async loadSampleData() {
    this.seeding.set(true);
    try {
      await this.seedService.seedSampleData();
      console.log('Sample data loaded!');
    } catch (error) {
      console.error('Failed to load sample data:', error);
    } finally {
      this.seeding.set(false);
    }
  }
}

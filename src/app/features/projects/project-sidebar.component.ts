import {
  Component,
  inject,
  signal,
  output,
  input,
  effect,
  ChangeDetectionStrategy,
} from '@angular/core';
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
  styleUrls: ['./project-sidebar.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectSidebarComponent {
  private readonly projectService = inject(ProjectService);
  private readonly seedService = inject(SeedDataService);

  // Input for currently selected project
  selectedProjectId = input<string | null>(null);

  // Output event when project is selected
  projectSelected = output<Project>();

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

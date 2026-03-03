import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ProjectService } from '../../core/services/project.service';
import { Project } from '../../core/models/domain.model';
import { ProjectFormModalComponent } from './project-form-modal.component';

@Component({
  selector: 'app-projects-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ProjectFormModalComponent],
  templateUrl: './projects-list.component.html',
  styles: [
    `
      .line-clamp-2 {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
    `,
  ],
})
export class ProjectsListComponent {
  private projectService = inject(ProjectService);
  private router = inject(Router);

  // State
  searchQuery = '';
  showCreateModal = signal(false);
  editingProject = signal<Project | null>(null);
  projectToDelete = signal<Project | null>(null);
  deleting = signal(false);

  // Data
  projects = toSignal(this.projectService.getMyProjects(), { initialValue: [] });

  // Computed filtered projects
  filteredProjects = computed(() => {
    const query = this.searchQuery.toLowerCase().trim();
    const allProjects = this.projects();

    if (!query) return allProjects;

    return allProjects.filter(
      (p) => p.name.toLowerCase().includes(query) || p.description?.toLowerCase().includes(query)
    );
  });

  openProject(project: Project) {
    this.router.navigate(['/projects', project.id]);
  }

  editProject(project: Project, event: Event) {
    event.stopPropagation();
    this.editingProject.set(project);
  }

  confirmDelete(project: Project, event: Event) {
    event.stopPropagation();
    this.projectToDelete.set(project);
  }

  async deleteProject() {
    const project = this.projectToDelete();
    if (!project) return;

    this.deleting.set(true);
    try {
      await this.projectService.deleteProject(project.id);
      this.projectToDelete.set(null);
    } catch (err) {
      console.error('Failed to delete project:', err);
    } finally {
      this.deleting.set(false);
    }
  }

  closeModal() {
    this.showCreateModal.set(false);
    this.editingProject.set(null);
  }

  onProjectSaved(project: Project) {
    this.closeModal();
    // Optionally navigate to the new/edited project
  }
}

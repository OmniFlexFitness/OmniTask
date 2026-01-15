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
  template: `
    <div class="min-h-screen p-6 md:p-8 relative z-10">
      <!-- Header -->
      <header class="mb-8">
        <div class="flex items-center justify-between">
          <div>
            <h1
              class="text-3xl font-bold text-white mb-2"
              style="font-family: 'Orbitron', sans-serif;"
            >
              Projects
            </h1>
            <p class="text-slate-400">Manage and organize your projects</p>
          </div>
          <button
            (click)="showCreateModal.set(true)"
            class="group relative px-4 py-2.5 bg-slate-900/80 text-cyan-400 font-semibold rounded-lg transition-all hover:scale-105"
            style="
              border: 2px solid transparent;
              background-image: linear-gradient(#0a0f1e, #0a0f1e), linear-gradient(135deg, #00d2ff, #e040fb);
              background-origin: border-box;
              background-clip: padding-box, border-box;
              box-shadow: 0 0 15px rgba(0, 210, 255, 0.3), 0 0 30px rgba(224, 64, 251, 0.15);
            "
          >
            <span class="flex items-center gap-2 group-hover:text-white transition-colors">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New Project
            </span>
          </button>
        </div>
      </header>

      <!-- Search & Filter -->
      <div class="mb-6">
        <div class="relative max-w-md">
          <input
            type="text"
            placeholder="Search projects..."
            [(ngModel)]="searchQuery"
            class="w-full bg-slate-900/60 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-slate-300 placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      <!-- Projects Grid -->
      @if (filteredProjects().length > 0) {
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        @for (project of filteredProjects(); track project.id) {
        <div
          class="group relative bg-slate-900/70 border border-white/10 rounded-xl p-5 hover:border-cyan-500/30 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/10 cursor-pointer"
          (click)="openProject(project)"
        >
          <!-- Color Bar -->
          <div
            class="absolute top-0 left-0 right-0 h-1 rounded-t-xl"
            [style.background-color]="project.color || '#6366f1'"
          ></div>

          <!-- Project Info -->
          <div class="mt-2">
            <h3
              class="text-lg font-bold text-white mb-1 group-hover:text-cyan-400 transition-colors"
            >
              {{ project.name }}
            </h3>
            <p class="text-sm text-slate-400 line-clamp-2 mb-4">
              {{ project.description || 'No description' }}
            </p>

            <!-- Stats -->
            <div class="flex items-center gap-4 text-xs text-slate-500">
              <span class="flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                {{ project.sections.length || 0 }} sections
              </span>
              <span class="flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                {{ project.memberIds.length || 1 }} members
              </span>
            </div>
          </div>

          <!-- Actions Menu -->
          <div class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <div class="flex items-center gap-1">
              <button
                (click)="editProject(project, $event)"
                class="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-white/5 rounded-lg transition-colors"
                title="Edit"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
              <button
                (click)="confirmDelete(project, $event)"
                class="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-white/5 rounded-lg transition-colors"
                title="Delete"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </div>

          <!-- Status Badge -->
          @if (project.status === 'archived') {
          <div class="absolute bottom-3 right-3">
            <span
              class="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-400 rounded-full"
            >
              Archived
            </span>
          </div>
          }
        </div>
        }
      </div>
      } @else {
      <!-- Empty State -->
      <div class="flex flex-col items-center justify-center py-16 text-center">
        <div class="w-20 h-20 mb-6 rounded-full bg-slate-800/50 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-10 w-10 text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
        </div>
        <h3 class="text-xl font-semibold text-white mb-2">No projects yet</h3>
        <p class="text-slate-400 mb-6">Create your first project to get started</p>
        <button
          (click)="showCreateModal.set(true)"
          class="px-4 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/30 transition-colors"
        >
          Create Project
        </button>
      </div>
      }

      <!-- Delete Confirmation Modal -->
      @if (projectToDelete()) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm"
        (click)="projectToDelete.set(null)"
      >
        <div
          class="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-2xl"
          (click)="$event.stopPropagation()"
        >
          <div class="flex items-center gap-3 mb-4">
            <div class="p-2 rounded-full bg-rose-500/20">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6 text-rose-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h3 class="text-lg font-bold text-white">Delete Project</h3>
          </div>

          <p class="text-slate-400 mb-6">
            Are you sure you want to delete
            <strong class="text-white">{{ projectToDelete()?.name }}</strong
            >? This will also delete all tasks in this project. This action cannot be undone.
          </p>

          <div class="flex justify-end gap-3">
            <button
              (click)="projectToDelete.set(null)"
              class="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              (click)="deleteProject()"
              [disabled]="deleting()"
              class="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {{ deleting() ? 'Deleting...' : 'Delete Project' }}
            </button>
          </div>
        </div>
      </div>
      }

      <!-- Create/Edit Modal -->
      @if (showCreateModal() || editingProject()) {
      <app-project-form-modal
        [editProject]="editingProject()"
        (close)="closeModal()"
        (saved)="onProjectSaved($event)"
      ></app-project-form-modal>
      }
    </div>
  `,
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

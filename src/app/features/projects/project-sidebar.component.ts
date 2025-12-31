import { Component, inject, signal, Output, EventEmitter, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectService } from '../../core/services/project.service';
import { Project } from '../../core/models/domain.model';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-project-sidebar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <aside class="ofx-sidebar h-full flex flex-col">
      <!-- Header -->
      <div class="px-4 py-5 border-b border-white/10">
        <div class="flex items-center justify-between">
          <h2 class="ofx-section-title text-sm">Projects</h2>
          <button
            class="ofx-icon-button"
            (click)="showCreateForm.set(true)"
            title="Create Project"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Create Project Form -->
      @if (showCreateForm()) {
        <div class="px-4 py-4 border-b border-white/10 bg-slate-900/50">
          <div class="space-y-3">
            <input
              type="text"
              #projectNameInput
              placeholder="Project name"
              class="ofx-input text-sm"
              (keydown.enter)="createProject(projectNameInput.value); projectNameInput.value = ''; showCreateForm.set(false)"
              (keydown.escape)="showCreateForm.set(false)"
            />
            <div class="flex gap-2">
              <button
                class="ofx-gradient-button text-xs px-3 py-2 flex-1"
                (click)="createProject(projectNameInput.value); projectNameInput.value = ''; showCreateForm.set(false)"
              >
                Create
              </button>
              <button
                class="ofx-ghost-button text-xs px-3 py-2"
                (click)="showCreateForm.set(false)"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Project List -->
      <nav class="flex-1 overflow-y-auto py-2">
        @if (projects()?.length === 0) {
          <div class="px-4 py-8 text-center text-slate-400 text-sm">
            <div class="ofx-empty-icon mx-auto mb-3 w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <p>No projects yet</p>
            <button
              class="text-cyan-400 hover:text-cyan-300 mt-2 text-sm"
              (click)="showCreateForm.set(true)"
            >
              Create your first project
            </button>
          </div>
        } @else {
          @for (project of projects(); track project.id) {
            <button
              class="ofx-project-item w-full text-left px-4 py-3 flex items-center gap-3 transition-all duration-200"
              [class.active]="selectedProjectId() === project.id"
              (click)="selectProject(project)"
            >
              <span
                class="w-3 h-3 rounded-sm shadow-lg"
                [style.background]="project.color || '#6366f1'"
                [style.box-shadow]="'0 0 8px ' + (project.color || '#6366f1') + '80'"
              ></span>
              <span class="flex-1 truncate text-sm font-medium text-slate-200">
                {{ project.name }}
              </span>
              @if (project.status === 'archived') {
                <span class="ofx-chip text-xs bg-gray-700/50 text-gray-400">
                  Archived
                </span>
              }
            </button>
          }
        }
      </nav>

      <!-- Footer -->
      <div class="px-4 py-3 border-t border-white/10 text-xs text-slate-500">
        {{ projects()?.length || 0 }} project(s)
      </div>
    </aside>
  `,
  styles: [`
    .ofx-sidebar {
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(10, 15, 30, 0.98));
      border-right: 1px solid rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(12px);
    }

    .ofx-icon-button {
      @apply p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all duration-200;
    }

    .ofx-icon-button:hover {
      box-shadow: 0 0 12px rgba(0, 210, 255, 0.3);
    }

    .ofx-project-item {
      border-left: 3px solid transparent;
    }

    .ofx-project-item:hover {
      background: linear-gradient(90deg, rgba(56, 189, 248, 0.08), transparent);
      border-left-color: rgba(0, 210, 255, 0.3);
    }

    .ofx-project-item.active {
      background: linear-gradient(90deg, rgba(56, 189, 248, 0.15), transparent);
      border-left-color: #00d2ff;
      box-shadow: inset 0 0 20px rgba(0, 210, 255, 0.1);
    }

    .ofx-project-item.active span:first-child {
      animation: pulse-glow 2s ease-in-out infinite;
    }

    @keyframes pulse-glow {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
  `]
})
export class ProjectSidebarComponent {
  private projectService = inject(ProjectService);

  // Input for currently selected project
  selectedProjectId = input<string | null>(null);

  // Output event when project is selected
  @Output() projectSelected = new EventEmitter<Project>();

  // Projects from service
  projects = toSignal(this.projectService.getMyProjects(), { initialValue: [] });

  // UI state
  showCreateForm = signal(false);

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
}

import { Component, input, output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../core/services/project.service';
import { Project } from '../../../core/models/domain.model';
import { SectionManagerComponent } from './section-manager.component';
import { TagManagerComponent } from './tag-manager.component';
import { CustomFieldManagerComponent } from './custom-field-manager/custom-field-manager.component';
import { ProjectMemberManagerComponent } from './project-member-manager.component';

/**
 * Project colors for selection
 */
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

/**
 * Project Settings Panel Component
 * Comprehensive project configuration including basic info, sections, tags, custom fields
 */
@Component({
  selector: 'app-project-settings-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SectionManagerComponent,
    TagManagerComponent,
    CustomFieldManagerComponent,
    ProjectMemberManagerComponent,
  ],
  template: `
    <div class="space-y-8">
      <!-- Basic Info Section -->
      <section class="ofx-settings-section">
        <h3 class="ofx-section-title">Basic Information</h3>

        <div class="space-y-4 mt-4">
          <!-- Project Name -->
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-2">Project Name</label>
            <input
              type="text"
              [value]="project().name"
              (input)="onNameChange($event)"
              class="ofx-input"
              placeholder="Project name"
            />
          </div>

          <!-- Description -->
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-2">Description</label>
            <textarea
              [value]="project().description || ''"
              (input)="onDescriptionChange($event)"
              rows="3"
              class="ofx-input"
              placeholder="What is this project about?"
            ></textarea>
          </div>

          <!-- Color -->
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-3">Project Color</label>
            <div class="flex flex-wrap gap-2">
              @for (color of colors; track color) {
              <button
                type="button"
                class="w-8 h-8 rounded-lg transition-all duration-200 hover:scale-110"
                [class.ring-2]="project().color === color"
                [class.ring-white]="project().color === color"
                [class.scale-110]="project().color === color"
                [style.background-color]="color"
                [style.box-shadow]="'0 0 10px ' + color + '60'"
                (click)="updateColor(color)"
              ></button>
              }
            </div>
          </div>

          <!-- Save Button -->
          @if (hasBasicChanges()) {
          <div class="flex gap-2 pt-2">
            <button class="ofx-gradient-button" [disabled]="saving()" (click)="saveBasicInfo()">
              {{ saving() ? 'Saving...' : 'Save Changes' }}
            </button>
            <button class="ofx-ghost-button" (click)="resetBasicInfo()">Cancel</button>
          </div>
          }
        </div>
      </section>

      <hr class="border-white/10" />

      <!-- Sections Management -->
      <section class="ofx-settings-section">
        <app-section-manager
          [projectId]="project().id"
          [sections]="project().sections || []"
          (sectionsChanged)="projectChanged.emit()"
        ></app-section-manager>
      </section>

      <hr class="border-white/10" />

      <!-- Tags Management -->
      <section class="ofx-settings-section">
        <app-tag-manager
          [projectId]="project().id"
          [tags]="project().tags || []"
          (tagsChanged)="projectChanged.emit()"
        ></app-tag-manager>
      </section>

      <hr class="border-white/10" />

      <!-- Custom Fields -->
      <section class="ofx-settings-section">
        <h3 class="text-sm font-semibold text-slate-200 mb-4">Custom Fields</h3>
        <app-custom-field-manager [project]="project()"></app-custom-field-manager>
      </section>

      <hr class="border-white/10" />

      <!-- Members Section (Placeholder) -->
      <!-- Members Section -->
      <section class="ofx-settings-section">
        <h3 class="ofx-section-title">Team Members</h3>
        <div class="mt-4">
          <app-project-member-manager [project]="project()"></app-project-member-manager>
        </div>
      </section>

      <hr class="border-white/10" />

      <!-- Danger Zone -->
      <section class="ofx-settings-section">
        <h3 class="text-sm font-semibold text-rose-400 mb-4">Danger Zone</h3>

        <div class="space-y-3">
          <!-- Archive/Restore -->
          @if (project().status === 'active') {
          <button
            class="w-full flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 hover:bg-amber-500/20 transition-colors"
            (click)="toggleArchive()"
          >
            <span class="flex items-center gap-2">
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
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                />
              </svg>
              Archive Project
            </span>
            <span class="text-xs text-amber-500/70">Hide from active projects</span>
          </button>
          } @else {
          <button
            class="w-full flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            (click)="toggleArchive()"
          >
            <span class="flex items-center gap-2">
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
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Restore Project
            </span>
            <span class="text-xs text-emerald-500/70">Make project active again</span>
          </button>
          }

          <!-- Delete -->
          <button
            class="w-full flex items-center justify-between p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 hover:bg-rose-500/20 transition-colors"
            (click)="confirmDelete()"
          >
            <span class="flex items-center gap-2">
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
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Delete Project
            </span>
            <span class="text-xs text-rose-500/70">Permanently remove project and all tasks</span>
          </button>
        </div>
      </section>
    </div>
  `,
  styles: [
    `
      .ofx-settings-section {
        /* Section styling handled by parent */
      }

      .ofx-section-title {
        font-size: 0.875rem;
        font-weight: 600;
        color: rgb(203, 213, 225);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
    `,
  ],
})
export class ProjectSettingsPanelComponent {
  private projectService = inject(ProjectService);

  project = input.required<Project>();
  projectChanged = output<void>();
  projectDeleted = output<void>();

  colors = PROJECT_COLORS;

  // Edit state
  editName = '';
  editDescription = '';
  saving = signal(false);

  hasBasicChanges = signal(false);

  ngOnInit() {
    this.resetBasicInfo();
  }

  ngOnChanges() {
    // Reset when project changes
    this.resetBasicInfo();
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

  getOwnerInitial(): string {
    return this.project().ownerId?.charAt(0)?.toUpperCase() || 'O';
  }

  async toggleArchive() {
    const project = this.project();
    const action = project.status === 'active' ? 'archive' : 'restore';

    if (confirm(`Are you sure you want to ${action} this project?`)) {
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
    const confirmed = confirm(
      `Are you sure you want to DELETE "${
        this.project().name
      }"?\n\nThis will permanently remove the project and ALL its tasks. This action cannot be undone.`
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

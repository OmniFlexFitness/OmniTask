import { Component, input, output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../core/services/project.service';
import { Section } from '../../../core/models/domain.model';

/**
 * Section colors for selection
 */
const SECTION_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#0ea5e9', // Sky
  '#00d2ff', // Cyan
];

/**
 * Section Manager Component
 * Manages Kanban columns/sections for a project
 */
@Component({
  selector: 'app-section-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold text-slate-200">Sections / Columns</h3>
        <button
          class="ofx-ghost-button text-xs"
          (click)="showAddForm.set(true)"
          [disabled]="showAddForm()"
        >
          + Add Section
        </button>
      </div>

      <!-- Add Section Form -->
      @if (showAddForm()) {
      <div class="p-4 bg-slate-800/50 rounded-lg border border-white/10 space-y-3">
        <input
          type="text"
          [(ngModel)]="newSectionName"
          placeholder="Section name..."
          class="ofx-input text-sm"
          #nameInput
        />

        <div>
          <label class="block text-xs text-slate-400 mb-2">Color</label>
          <div class="flex flex-wrap gap-2">
            @for (color of colors; track color) {
            <button
              type="button"
              class="w-6 h-6 rounded-md transition-transform hover:scale-110"
              [class.ring-2]="newSectionColor === color"
              [class.ring-white]="newSectionColor === color"
              [style.background-color]="color"
              (click)="newSectionColor = color"
            ></button>
            }
          </div>
        </div>

        <div class="flex gap-2">
          <button
            class="ofx-gradient-button text-xs flex-1"
            [disabled]="!newSectionName.trim() || saving()"
            (click)="addSection()"
          >
            {{ saving() ? 'Adding...' : 'Add Section' }}
          </button>
          <button class="ofx-ghost-button text-xs" (click)="cancelAdd()">Cancel</button>
        </div>
      </div>
      }

      <!-- Sections List -->
      <div class="space-y-2">
        @for (section of sections(); track section.id) {
        <div
          class="flex items-center gap-3 p-3 bg-slate-800/40 rounded-lg border border-white/5 hover:border-white/10 transition-colors group"
        >
          <!-- Color indicator -->
          <div
            class="w-3 h-3 rounded-sm flex-shrink-0"
            [style.background-color]="section.color || '#6366f1'"
            [style.box-shadow]="'0 0 8px ' + (section.color || '#6366f1') + '60'"
          ></div>

          <!-- Section name -->
          @if (editingId() === section.id) {
          <input
            type="text"
            [(ngModel)]="editingName"
            class="ofx-input text-sm flex-1"
            (keydown.enter)="saveEdit(section)"
            (keydown.escape)="cancelEdit()"
          />
          } @else {
          <span class="text-sm text-slate-200 flex-1">{{ section.name }}</span>
          }

          <!-- Order indicator -->
          <span class="text-xs text-slate-500 px-2 py-0.5 bg-slate-700/50 rounded">
            #{{ section.order + 1 }}
          </span>

          <!-- Actions -->
          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            @if (editingId() === section.id) {
            <button
              class="p-1 text-emerald-400 hover:bg-white/5 rounded transition-colors"
              (click)="saveEdit(section)"
              title="Save"
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
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </button>
            <button
              class="p-1 text-slate-400 hover:bg-white/5 rounded transition-colors"
              (click)="cancelEdit()"
              title="Cancel"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            } @else {
            <button
              class="p-1 text-slate-400 hover:text-cyan-400 hover:bg-white/5 rounded transition-colors"
              (click)="startEdit(section)"
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
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
            </button>
            <button
              class="p-1 text-slate-400 hover:text-rose-400 hover:bg-white/5 rounded transition-colors"
              (click)="confirmDelete(section)"
              title="Delete"
              [disabled]="sections().length <= 1"
              [class.opacity-30]="sections().length <= 1"
              [class.cursor-not-allowed]="sections().length <= 1"
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
            }
          </div>
        </div>
        } @empty {
        <div class="text-center py-6 text-slate-500 text-sm">
          No sections yet. Add one to organize your tasks.
        </div>
        }
      </div>

      @if (sections().length <= 1) {
      <p class="text-xs text-slate-500 mt-2">* Projects must have at least one section</p>
      }
    </div>
  `,
})
export class SectionManagerComponent {
  private projectService = inject(ProjectService);

  projectId = input.required<string>();
  sections = input.required<Section[]>();

  sectionsChanged = output<void>();

  colors = SECTION_COLORS;

  // Add form state
  showAddForm = signal(false);
  newSectionName = '';
  newSectionColor = SECTION_COLORS[0];
  saving = signal(false);

  // Edit state
  editingId = signal<string | null>(null);
  editingName = '';

  cancelAdd() {
    this.showAddForm.set(false);
    this.newSectionName = '';
    this.newSectionColor = SECTION_COLORS[0];
  }

  async addSection() {
    if (!this.newSectionName.trim()) return;

    this.saving.set(true);
    try {
      await this.projectService.addSection(
        this.projectId(),
        this.newSectionName.trim(),
        this.newSectionColor
      );
      this.cancelAdd();
      this.sectionsChanged.emit();
    } catch (error) {
      console.error('Failed to add section:', error);
    } finally {
      this.saving.set(false);
    }
  }

  startEdit(section: Section) {
    this.editingId.set(section.id);
    this.editingName = section.name;
  }

  cancelEdit() {
    this.editingId.set(null);
    this.editingName = '';
  }

  async saveEdit(section: Section) {
    if (!this.editingName.trim()) return;

    try {
      await this.projectService.updateSection(this.projectId(), section.id, {
        name: this.editingName.trim(),
      });
      this.cancelEdit();
      this.sectionsChanged.emit();
    } catch (error) {
      console.error('Failed to update section:', error);
    }
  }

  async confirmDelete(section: Section) {
    if (this.sections().length <= 1) {
      alert('Cannot delete the last section. Projects must have at least one section.');
      return;
    }

    const confirmed = confirm(
      `Delete section "${section.name}"?\n\nTasks in this section will become unassigned to any section.`
    );

    if (confirmed) {
      try {
        await this.projectService.removeSection(this.projectId(), section.id);
        this.sectionsChanged.emit();
      } catch (error) {
        console.error('Failed to delete section:', error);
      }
    }
  }
}

import { Component, input, output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../core/services/project.service';
import { Tag } from '../../../core/models/domain.model';

/**
 * Tag colors for selection
 */
const TAG_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#0ea5e9', // Sky
  '#6366f1', // Indigo
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#00d2ff', // Cyan
];

/**
 * Tag Manager Component
 * Manages project-specific tags for task categorization
 */
@Component({
  selector: 'app-tag-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold text-slate-200">Tags</h3>
        <button
          class="ofx-ghost-button text-xs"
          (click)="showAddForm.set(true)"
          [disabled]="showAddForm()"
        >
          + Add Tag
        </button>
      </div>

      <!-- Add Tag Form -->
      @if (showAddForm()) {
      <div class="p-4 bg-slate-800/50 rounded-lg border border-white/10 space-y-3">
        <input
          type="text"
          [(ngModel)]="newTagName"
          placeholder="Tag name..."
          class="ofx-input text-sm"
        />

        <div>
          <label class="block text-xs text-slate-400 mb-2">Color</label>
          <div class="flex flex-wrap gap-2">
            @for (color of colors; track color) {
            <button
              type="button"
              class="w-6 h-6 rounded-full transition-transform hover:scale-110"
              [class.ring-2]="newTagColor === color"
              [class.ring-white]="newTagColor === color"
              [style.background-color]="color"
              (click)="newTagColor = color"
            ></button>
            }
          </div>
        </div>

        <!-- Preview -->
        @if (newTagName.trim()) {
        <div>
          <label class="block text-xs text-slate-400 mb-2">Preview</label>
          <span
            class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
            [style.background-color]="newTagColor + '20'"
            [style.color]="newTagColor"
            [style.border]="'1px solid ' + newTagColor + '40'"
          >
            {{ newTagName }}
          </span>
        </div>
        }

        <div class="flex gap-2">
          <button
            class="ofx-gradient-button text-xs flex-1"
            [disabled]="!newTagName.trim() || saving()"
            (click)="addTag()"
          >
            {{ saving() ? 'Adding...' : 'Add Tag' }}
          </button>
          <button class="ofx-ghost-button text-xs" (click)="cancelAdd()">Cancel</button>
        </div>
      </div>
      }

      <!-- Tags List -->
      <div class="flex flex-wrap gap-2">
        @for (tag of tags(); track tag.id) {
        <div
          class="group relative inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-all"
          [style.background-color]="tag.color + '20'"
          [style.color]="tag.color"
          [style.border]="'1px solid ' + tag.color + '40'"
        >
          <span>{{ tag.name }}</span>

          <!-- Delete button on hover -->
          <button
            class="ml-2 opacity-0 group-hover:opacity-100 transition-opacity hover:text-white"
            (click)="confirmDelete(tag)"
            title="Delete tag"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-3.5 w-3.5"
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
        </div>
        } @empty {
        <div class="text-slate-500 text-sm py-4 text-center w-full">
          No tags yet. Create tags to categorize your tasks.
        </div>
        }
      </div>
    </div>
  `,
})
export class TagManagerComponent {
  private projectService = inject(ProjectService);

  projectId = input.required<string>();
  tags = input.required<Tag[]>();

  tagsChanged = output<void>();

  colors = TAG_COLORS;

  // Add form state
  showAddForm = signal(false);
  newTagName = '';
  newTagColor = TAG_COLORS[0];
  saving = signal(false);

  cancelAdd() {
    this.showAddForm.set(false);
    this.newTagName = '';
    this.newTagColor = TAG_COLORS[0];
  }

  async addTag() {
    if (!this.newTagName.trim()) return;

    this.saving.set(true);
    try {
      await this.projectService.addTag(this.projectId(), {
        name: this.newTagName.trim(),
        color: this.newTagColor,
      });
      this.cancelAdd();
      this.tagsChanged.emit();
    } catch (error) {
      console.error('Failed to add tag:', error);
    } finally {
      this.saving.set(false);
    }
  }

  async confirmDelete(tag: Tag) {
    const confirmed = confirm(
      `Delete tag "${tag.name}"?\n\nTasks using this tag will no longer have it assigned.`
    );

    if (confirmed) {
      try {
        await this.projectService.removeTag(this.projectId(), tag.id);
        this.tagsChanged.emit();
      } catch (error) {
        console.error('Failed to delete tag:', error);
      }
    }
  }
}

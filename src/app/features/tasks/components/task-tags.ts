import { Component, input, model, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Project } from '../../../core/models/domain.model';
import { ProjectService } from '../../../core/services/project.service';

// Palette used when auto-assigning a color to a user-typed tag. Mirrors the
// palette exposed in the project Tag Manager so manually-picked and
// auto-generated tags share the same visual vocabulary.
const AUTO_TAG_PALETTE = [
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
 * Pick a random color that isn't already used by any of the existing tags.
 * Once every palette entry is taken we fall back to a plain random pick so
 * creation never blocks on exhausted colors.
 */
function pickRandomTagColor(existingColors: readonly string[]): string {
  const taken = new Set(existingColors.map((c) => c.toLowerCase()));
  const available = AUTO_TAG_PALETTE.filter((c) => !taken.has(c.toLowerCase()));
  const pool = available.length > 0 ? available : AUTO_TAG_PALETTE;
  return pool[Math.floor(Math.random() * pool.length)];
}

@Component({
  selector: 'app-task-tags',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './task-tags.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskTagsComponent {
  private projectService = inject(ProjectService);

  project = input<Project | null>(null);
  selectedTags = model.required<Set<string>>();

  selectedTagsArray = computed(() => Array.from(this.selectedTags()));

  toggleTag(tagName: string): void {
    this.selectedTags.update((tags) => {
      const newTags = new Set(tags);
      if (newTags.has(tagName)) {
        newTags.delete(tagName);
      } else {
        newTags.add(tagName);
      }
      return newTags;
    });
  }

  /**
   * Handler for clicks on a selected tag chip. Holding Ctrl/Cmd or Shift
   * removes the tag; a plain click does nothing (to avoid accidental removal).
   */
  onSelectedTagClick(tagName: string, event: MouseEvent): void {
    event.stopPropagation();
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      this.selectedTags.update((tags) => {
        const newTags = new Set(tags);
        newTags.delete(tagName);
        return newTags;
      });
    }
  }

  async addTag(tagName: string): Promise<void> {
    const name = tagName.trim();
    if (!name) return;

    // Add to project definitions first if it doesn't exist
    const project = this.project();
    if (project) {
      try {
        const existingColors = (project.tags || []).map((t) => t.color);
        await this.projectService.addTag(project.id, {
          name: name,
          color: pickRandomTagColor(existingColors),
        });
      } catch (err) {
        console.error('Failed to add tag to project', err);
        // Sometimes it might fail if already exists, we still want to select it
      }
    }

    // Select it
    this.selectedTags.update((tags) => {
      const newTags = new Set(tags);
      newTags.add(name);
      return newTags;
    });
  }

  getTagColor = (tagName: string): string => {
    const projectTags = this.project()?.tags || [];
    const tag = projectTags.find((t) => t.name === tagName);
    return tag?.color || '#94a3b8';
  };
}

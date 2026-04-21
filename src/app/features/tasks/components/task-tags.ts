import { Component, input, model, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Project } from '../../../core/models/domain.model';
import { ProjectService } from '../../../core/services/project.service';

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
        // Simple hash for color generation
        const colors = ['#f472b6', '#34d399', '#60a5fa', '#a78bfa', '#fbbf24', '#f87171'];
        const colorIndex =
          name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;

        await this.projectService.addTag(project.id, {
          name: name,
          color: colors[colorIndex],
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

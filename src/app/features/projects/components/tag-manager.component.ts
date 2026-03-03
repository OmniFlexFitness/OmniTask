import { Component, input, output, inject, signal , ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../core/services/project.service';
import { DialogService } from '../../../core/services/dialog.service';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-tag-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tag-manager.component.html',
})
export class TagManagerComponent {
  private projectService = inject(ProjectService);
  private dialogService = inject(DialogService);

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
    const confirmed = await this.dialogService.confirm(
      `Delete tag "${tag.name}"?\n\nTasks using this tag will no longer have it assigned.`,
      'Delete Tag',
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

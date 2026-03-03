import { Component, input, output, inject, signal , ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../core/services/project.service';
import { DialogService } from '../../../core/services/dialog.service';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-section-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './section-manager.component.html',
})
export class SectionManagerComponent {
  private projectService = inject(ProjectService);
  private dialogService = inject(DialogService);

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
      await this.dialogService.alert('Cannot delete the last section. Projects must have at least one section.', 'Cannot Delete Section');
      return;
    }

    const confirmed = await this.dialogService.confirm(
      `Delete section "${section.name}"?\n\nTasks in this section will become unassigned to any section.`,
      'Delete Section'
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

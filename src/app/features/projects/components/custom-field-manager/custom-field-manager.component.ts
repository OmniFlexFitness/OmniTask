import { Component, input, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../../core/services/project.service';
import { DialogService } from '../../../../core/services/dialog.service';
import {
  Project,
  CustomFieldType,
  CustomFieldOption,
  CustomFieldDefinition,
} from '../../../../core/models/domain.model';

@Component({
  selector: 'app-custom-field-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './custom-field-manager.component.html',
})
export class CustomFieldManagerComponent {
  projectService = inject(ProjectService);
  dialogService = inject(DialogService);
  project = input.required<Project>();

  isAdding = signal(false);
  newFieldType = signal<CustomFieldType>('text');
  newFieldName = '';
  newFieldOptions = signal<CustomFieldOption[]>([]);
  fieldToDelete = signal<CustomFieldDefinition | null>(null);
  deleting = signal(false);

  fieldTypes: { value: CustomFieldType; label: string; icon: string }[] = [
    { value: 'text', label: 'Text', icon: 'fas fa-align-left' },
    { value: 'number', label: 'Number', icon: 'fas fa-hashtag' },
    { value: 'date', label: 'Date', icon: 'fas fa-calendar' },
    { value: 'dropdown', label: 'Dropdown', icon: 'fas fa-list' },
    { value: 'status', label: 'Status', icon: 'fas fa-info-circle' },
    { value: 'user', label: 'User', icon: 'fas fa-user' },
  ];

  isDuplicateFieldName = computed(() => {
    const name = this.newFieldName.trim().toLowerCase();
    if (!name) return false;
    return this.project().customFields?.some(f => f.name.toLowerCase() === name) || false;
  });

  canCreateField = computed(() => {
    if (!this.newFieldName.trim() || this.isDuplicateFieldName()) {
      return false;
    }
    // For dropdown and status fields, require at least one option
    if (this.newFieldType() === 'dropdown' || this.newFieldType() === 'status') {
      return this.newFieldOptions().length > 0;
    }
    return true;
  });

  getFieldIcon(type: CustomFieldType): string {
    return this.fieldTypes.find((t) => t.value === type)?.icon || 'fas fa-circle';
  }

  startAdding() {
    this.newFieldName = '';
    this.newFieldType.set('text');
    this.newFieldOptions.set([]);
    this.isAdding.set(true);
  }

  addOption(label: string) {
    if (!label.trim()) return;
    const opt: CustomFieldOption = {
      id: crypto.randomUUID(),
      label: label.trim(),
      color: '#64748b', // Default slate color
    };
    this.newFieldOptions.update((opts) => [...opts, opt]);
  }

  removeOption(id: string) {
    this.newFieldOptions.update((opts) => opts.filter((o) => o.id !== id));
  }

  async createField() {
    if (!this.canCreateField()) return;

    try {
      const fieldData: Omit<CustomFieldDefinition, 'id' | 'projectId'> = {
        name: this.newFieldName.trim(),
        type: this.newFieldType(),
      };

      if (this.newFieldType() === 'dropdown' || this.newFieldType() === 'status') {
        fieldData.options = this.newFieldOptions();
      }

      await this.projectService.addCustomField(this.project().id, fieldData);
      this.isAdding.set(false);
      this.newFieldName = '';
      this.newFieldOptions.set([]);
    } catch (err) {
      console.error('Failed to create field', err);
      await this.dialogService.alert('Failed to create custom field. Please try again.', 'Error');
    }
  }

  confirmDeleteField(field: CustomFieldDefinition) {
    this.fieldToDelete.set(field);
  }

  async deleteField() {
    const field = this.fieldToDelete();
    if (!field) return;

    this.deleting.set(true);
    try {
      await this.projectService.removeCustomField(this.project().id, field.id);
      this.fieldToDelete.set(null);
    } catch (err) {
      console.error('Failed to remove field', err);
    } finally {
      this.deleting.set(false);
    }
  }
}

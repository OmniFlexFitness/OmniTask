import {
  Component,
  input,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../../core/services/project.service';
import { CustomFieldService } from '../../../../core/services/custom-field.service';
import { DialogService } from '../../../../core/services/dialog.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Project,
  CustomFieldType,
  CustomFieldOption,
  CustomFieldDefinition,
} from '../../../../core/models/domain.model';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-custom-field-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './custom-field-manager.component.html',
})
export class CustomFieldManagerComponent {
  projectService = inject(ProjectService);
  customFieldService = inject(CustomFieldService);
  dialogService = inject(DialogService);

  project = input.required<Project>();

  // Global field library
  globalFields = signal<CustomFieldDefinition[]>([]);

  // UI states
  mode = signal<'list' | 'create' | 'link' | 'edit'>('list');

  newFieldType = signal<CustomFieldType>('text');
  newFieldName = '';
  newFieldOptions = signal<CustomFieldOption[]>([]);
  newFieldCurrency = '$';
  fieldToDelete = signal<CustomFieldDefinition | null>(null);
  deleting = signal(false);

  // Edit mode state
  fieldToEdit = signal<CustomFieldDefinition | null>(null);
  editFieldName = '';
  editFieldOptions = signal<CustomFieldOption[]>([]);
  editFieldCurrency = '$';
  saving = signal(false);

  fieldTypes: { value: CustomFieldType; label: string; icon: string }[] = [
    { value: 'text', label: 'Text', icon: 'fas fa-align-left' },
    { value: 'number', label: 'Number', icon: 'fas fa-hashtag' },
    { value: 'currency', label: 'Currency', icon: 'fas fa-dollar-sign' },
    { value: 'date', label: 'Date', icon: 'fas fa-calendar' },
    { value: 'checkbox', label: 'Checkbox', icon: 'fas fa-check-square' },
    { value: 'dropdown', label: 'Dropdown', icon: 'fas fa-list' },
    { value: 'multi-select', label: 'Multi-select', icon: 'fas fa-tags' },
    { value: 'url', label: 'URL', icon: 'fas fa-link' },
    { value: 'status', label: 'Status', icon: 'fas fa-info-circle' },
    { value: 'user', label: 'User', icon: 'fas fa-user' },
  ];

  constructor() {
    this.customFieldService
      .getCustomFields()
      .pipe(takeUntilDestroyed())
      .subscribe((fields) => {
        this.globalFields.set(fields);
      });
  }

  // Fields currently linked to this project
  projectFields = computed(() => {
    const ids = this.project().customFieldIds || [];
    return this.globalFields().filter((f) => ids.includes(f.id));
  });

  // Fields available to be linked (not yet in project)
  availableFieldsToLink = computed(() => {
    const ids = this.project().customFieldIds || [];
    return this.globalFields().filter((f) => !ids.includes(f.id));
  });

  isDuplicateFieldName = computed(() => {
    const name = this.newFieldName.trim().toLowerCase();
    if (!name) return false;
    // Check against global library to prevent duplicate global names makes sense, or just project level.
    // Opting for global level to keep library clean.
    return this.globalFields().some((f) => f.name.toLowerCase() === name);
  });

  canCreateField = computed(() => {
    if (!this.newFieldName.trim() || this.isDuplicateFieldName()) return false;

    const type = this.newFieldType();
    if (type === 'dropdown' || type === 'status' || type === 'multi-select') {
      return this.newFieldOptions().length > 0;
    }
    return true;
  });

  isDuplicateEditName = computed(() => {
    const field = this.fieldToEdit();
    if (!field) return false;
    const name = this.editFieldName.trim().toLowerCase();
    if (!name) return false;
    return this.globalFields().some((f) => f.name.toLowerCase() === name && f.id !== field.id);
  });

  canSaveEdit = computed(() => {
    const field = this.fieldToEdit();
    if (!field || !this.editFieldName.trim() || this.isDuplicateEditName()) return false;
    const type = field.type;
    if (type === 'dropdown' || type === 'status' || type === 'multi-select') {
      return this.editFieldOptions().length > 0;
    }
    return true;
  });

  getFieldIcon(type: CustomFieldType): string {
    return this.fieldTypes.find((t) => t.value === type)?.icon || 'fas fa-circle';
  }

  startCreating() {
    this.newFieldName = '';
    this.newFieldType.set('text');
    this.newFieldOptions.set([]);
    this.newFieldCurrency = '$';
    this.fieldToEdit.set(null);
    this.mode.set('create');
  }

  addOption(label: string) {
    if (!label.trim()) return;
    const opt: CustomFieldOption = {
      id: crypto.randomUUID(),
      label: label.trim(),
      color: '#64748b',
    };
    this.newFieldOptions.update((opts) => [...opts, opt]);
  }

  removeOption(id: string) {
    this.newFieldOptions.update((opts) => opts.filter((o) => o.id !== id));
  }

  startEditing(field: CustomFieldDefinition) {
    this.fieldToEdit.set(field);
    this.editFieldName = field.name;
    this.editFieldOptions.set(field.options ? [...field.options] : []);
    this.editFieldCurrency = field.currencySymbol ?? '$';
    this.mode.set('edit');
  }

  addEditOption(label: string) {
    if (!label.trim()) return;
    const opt: CustomFieldOption = {
      id: crypto.randomUUID(),
      label: label.trim(),
      color: '#64748b',
    };
    this.editFieldOptions.update((opts) => [...opts, opt]);
  }

  removeEditOption(id: string) {
    this.editFieldOptions.update((opts) => opts.filter((o) => o.id !== id));
  }

  async saveEdit() {
    if (!this.canSaveEdit()) return;
    const field = this.fieldToEdit();
    if (!field) return;

    this.saving.set(true);
    try {
      const data: Partial<Omit<CustomFieldDefinition, 'id' | 'userId' | 'createdAt' | 'updatedAt'>> = {
        name: this.editFieldName.trim(),
      };

      const type = field.type;
      if (type === 'dropdown' || type === 'status' || type === 'multi-select') {
        data.options = this.editFieldOptions();
      }
      if (type === 'currency') {
        data.currencySymbol = this.editFieldCurrency;
      }

      await this.customFieldService.updateCustomField(field.id, data);
      this.mode.set('list');
      this.fieldToEdit.set(null);
    } catch (err) {
      console.error('Failed to update field', err);
      await this.dialogService.alert('Failed to update custom field. Please try again.', 'Error');
    } finally {
      this.saving.set(false);
    }
  }

  async deleteFromLibrary() {
    const field = this.fieldToEdit();
    if (!field) return;

    const confirmed = await this.dialogService.confirm(
      `Permanently delete "${field.name}" from your library? This cannot be undone. Existing task values for this field will no longer be accessible.`,
    );
    if (!confirmed) return;

    this.saving.set(true);
    try {
      await this.customFieldService.deleteCustomField(field.id);
      this.mode.set('list');
      this.fieldToEdit.set(null);
    } catch (err) {
      console.error('Failed to delete field from library', err);
      await this.dialogService.alert('Failed to delete custom field. Please try again.', 'Error');
    } finally {
      this.saving.set(false);
    }
  }

  async createField() {
    if (!this.canCreateField()) return;

    try {
      const fieldData: any = {
        name: this.newFieldName.trim(),
        type: this.newFieldType(),
      };

      const type = this.newFieldType();
      if (type === 'dropdown' || type === 'status' || type === 'multi-select') {
        fieldData.options = this.newFieldOptions();
      }
      if (type === 'currency') {
        fieldData.currencySymbol = this.newFieldCurrency;
      }

      // 1. Create in global library
      const newFieldId = await this.customFieldService.createCustomField(fieldData);

      if (newFieldId) {
        // 2. Link to this project
        await this.projectService.linkCustomField(this.project().id, newFieldId);
      }

      this.mode.set('list');
      this.newFieldName = '';
      this.newFieldOptions.set([]);
    } catch (err) {
      console.error('Failed to create field', err);
      await this.dialogService.alert('Failed to create custom field. Please try again.', 'Error');
    }
  }

  async linkExistingField(fieldId: string) {
    try {
      await this.projectService.linkCustomField(this.project().id, fieldId);
      this.mode.set('list');
    } catch (err) {
      console.error('Failed to link field', err);
    }
  }

  confirmUnlinkField(field: CustomFieldDefinition) {
    this.fieldToDelete.set(field);
  }

  async unlinkField() {
    const field = this.fieldToDelete();
    if (!field) return;

    this.deleting.set(true);
    try {
      // Unlink it from the project, dont delete globally
      await this.projectService.unlinkCustomField(this.project().id, field.id);
      this.fieldToDelete.set(null);
    } catch (err) {
      console.error('Failed to unlink field', err);
    } finally {
      this.deleting.set(false);
    }
  }
}

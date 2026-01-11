import { Component, input, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../../core/services/project.service';
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
  template: `
    <div class="bg-[#1e293b]/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
      <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <i class="fas fa-sliders-h text-cyan-400"></i>
        Custom Fields
      </h3>

      <!-- Field List -->
      <div class="space-y-3 mb-6">
        @for (field of project().customFields; track field.id) {
        <div
          class="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors group"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-8 h-8 rounded bg-slate-700 flex items-center justify-center text-slate-400"
            >
              <i [class]="getFieldIcon(field.type)"></i>
            </div>
            <div>
              <div class="text-sm font-medium text-slate-200">{{ field.name }}</div>
              <div class="text-xs text-slate-500 uppercase tracking-wider">{{ field.type }}</div>
            </div>
          </div>

          <button
            (click)="removeField(field.id)"
            class="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-2"
            title="Remove Field"
          >
            <i class="fas fa-trash"></i>
          </button>
        </div>
        } @empty {
        <div
          class="text-center py-6 text-slate-500 italic bg-slate-800/20 rounded-lg border border-slate-800 border-dashed"
        >
          No custom fields defined
        </div>
        }
      </div>

      <!-- Add New Field -->
      @if (isAdding()) {
      <div
        class="bg-slate-800 p-4 rounded-lg border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.1)] relative overflow-hidden"
      >
        <!-- Glow effect -->
        <div class="absolute top-0 left-0 w-1 h-full bg-cyan-500"></div>

        <div class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1"
              >Field Type</label
            >
            <div class="grid grid-cols-3 gap-2">
              @for (type of fieldTypes; track type.value) {
              <button
                type="button"
                (click)="newFieldType.set(type.value)"
                [class.ring-2]="newFieldType() === type.value"
                [class.ring-cyan-500]="newFieldType() === type.value"
                [class.bg-cyan-500/10]="newFieldType() === type.value"
                class="flex flex-col items-center gap-2 p-2 rounded bg-slate-700/50 border border-slate-600 hover:bg-slate-700 hover:border-slate-500 transition-all text-xs"
              >
                <i
                  [class]="type.icon"
                  [class.text-cyan-400]="newFieldType() === type.value"
                  [class.text-slate-400]="newFieldType() !== type.value"
                ></i>
                <span
                  [class.text-white]="newFieldType() === type.value"
                  [class.text-slate-400]="newFieldType() !== type.value"
                  >{{ type.label }}</span
                >
              </button>
              }
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1"
              >Field Name</label
            >
            <input
              type="text"
              [ngModel]="newFieldName()"
              (ngModelChange)="newFieldName.set($event)"
              placeholder="e.g., Priority Score, Client Name..."
              class="w-full bg-slate-900/50 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors placeholder:text-slate-600"
              [class.border-red-500]="isDuplicateFieldName()"
              [class.focus:border-red-500]="isDuplicateFieldName()"
              [class.focus:ring-red-500]="isDuplicateFieldName()"
              (keyup.enter)="createField()"
            />
            @if (isDuplicateFieldName()) {
            <p class="mt-1 text-xs text-red-400">
              A custom field with this name already exists in this project. Please choose a different name.
            </p>
            }
          </div>

          <!-- Options for Dropdowns -->
          @if (newFieldType() === 'dropdown' || newFieldType() === 'status') {
          <div>
            <label class="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1"
              >Options</label
            >
            <div class="space-y-2">
              @for (opt of newFieldOptions(); track opt.id) {
              <div class="flex items-center gap-2">
                <input
                  type="color"
                  [value]="opt.color"
                  (change)="opt.color = $any($event.target).value"
                  class="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0"
                  title="Option Color"
                />
                <span class="text-sm text-slate-300 flex-1">{{ opt.label }}</span>
                <button (click)="removeOption(opt.id)" class="text-slate-500 hover:text-red-400">
                  <i class="fas fa-times"></i>
                </button>
              </div>
              }
              <div class="flex gap-2">
                <input
                  #optInput
                  type="text"
                  placeholder="Add option..."
                  class="flex-1 bg-slate-900/50 border border-slate-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-cyan-500 placeholder:text-slate-600"
                  (keyup.enter)="addOption(optInput.value); optInput.value = ''"
                />
                <button
                  (click)="addOption(optInput.value); optInput.value = ''"
                  class="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
                >
                  <i class="fas fa-plus"></i>
                </button>
              </div>
            </div>
          </div>
          }

          <div class="flex justify-end gap-2 pt-2">
            <button
              (click)="isAdding.set(false)"
              class="px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              (click)="createField()"
              [disabled]="!canCreateField()"
              class="px-3 py-1.5 text-sm font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/50 rounded hover:bg-cyan-500 hover:text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Field
            </button>
          </div>
        </div>
      </div>
      } @else {
      <button
        (click)="startAdding()"
        class="w-full py-2 border border-dashed border-slate-700 rounded-lg text-slate-400 hover:text-cyan-400 hover:border-cyan-500/50 hover:bg-slate-800/50 transition-all flex items-center justify-center gap-2 text-sm font-medium group"
      >
        <i class="fas fa-plus transition-transform group-hover:rotate-90"></i>
        Add Custom Field
      </button>
      }
    </div>
  `,
})
export class CustomFieldManagerComponent {
  projectService = inject(ProjectService);
  project = input.required<Project>();

  isAdding = signal(false);
  newFieldType = signal<CustomFieldType>('text');
  newFieldName = signal('');
  newFieldOptions = signal<CustomFieldOption[]>([]);

  fieldTypes: { value: CustomFieldType; label: string; icon: string }[] = [
    { value: 'text', label: 'Text', icon: 'fas fa-align-left' },
    { value: 'number', label: 'Number', icon: 'fas fa-hashtag' },
    { value: 'date', label: 'Date', icon: 'fas fa-calendar' },
    { value: 'dropdown', label: 'Dropdown', icon: 'fas fa-list' },
    { value: 'status', label: 'Status', icon: 'fas fa-info-circle' },
    { value: 'user', label: 'User', icon: 'fas fa-user' },
  ];

  isDuplicateFieldName = computed(() => {
    const name = this.newFieldName().trim().toLowerCase();
    if (!name) return false;
    return this.project().customFields?.some(f => f.name.toLowerCase() === name) || false;
  });

  canCreateField = computed(() => {
    if (!this.newFieldName().trim() || this.isDuplicateFieldName()) {
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
    this.newFieldName.set('');
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
    const trimmedName = this.newFieldName().trim();
    if (!trimmedName || this.isDuplicateFieldName()) return;

    // Validate dropdown/status fields have options
    if (this.newFieldType() === 'dropdown' || this.newFieldType() === 'status') {
      if (this.newFieldOptions().length === 0) {
        alert('Dropdown and status fields require at least one option.');
        return;
      }
    }

    try {
      const fieldData: Omit<CustomFieldDefinition, 'id' | 'projectId'> = {
        name: trimmedName,
        type: this.newFieldType(),
      };

      if (this.newFieldType() === 'dropdown' || this.newFieldType() === 'status') {
        fieldData.options = this.newFieldOptions();
      }

      await this.projectService.addCustomField(this.project().id, fieldData);
      this.isAdding.set(false);
      this.newFieldName.set('');
      this.newFieldOptions.set([]);
    } catch (err) {
      console.error('Failed to create field', err);
      alert('Failed to create custom field. Please try again.');
    }
  }

  async removeField(fieldId: string) {
    if (
      !confirm(
        'Are you sure you want to remove this field? Existing data will be preserved but hidden.'
      )
    )
      return;
    try {
      await this.projectService.removeCustomField(this.project().id, fieldId);
    } catch (err) {
      console.error('Failed to remove field', err);
      alert('Failed to remove field. Please try again.');
    }
  }
}

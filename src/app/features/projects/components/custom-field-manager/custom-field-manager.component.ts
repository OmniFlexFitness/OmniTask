import { Component, input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../../core/services/project.service';
import {
  Project,
  CustomFieldType,
  CustomFieldDefinition,
  CustomFieldOption,
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
            (click)="confirmDeleteField(field)"
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
                [class.bg-cyan-500_10]="newFieldType() === type.value"
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
              [(ngModel)]="newFieldName"
              placeholder="e.g., Priority Score, Client Name..."
              class="w-full bg-slate-900/50 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors placeholder:text-slate-600"
              (keyup.enter)="createField()"
            />
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
              [disabled]="!newFieldName()"
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

      <!-- Delete Confirmation Modal -->
      @if (fieldToDelete()) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm"
        (click)="fieldToDelete.set(null)"
      >
        <div
          class="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl p-6 shadow-2xl"
          (click)="$event.stopPropagation()"
        >
          <div class="flex items-center gap-3 mb-4">
            <div class="p-2 rounded-full bg-rose-500/20">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6 text-rose-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h3 class="text-lg font-bold text-white">Remove Custom Field</h3>
          </div>

          <p class="text-slate-400 mb-6">
            Are you sure you want to remove
            <strong class="text-white">{{ fieldToDelete()?.name }}</strong
            >? Existing data will be preserved but hidden. This action cannot be undone.
          </p>

          <div class="flex justify-end gap-3">
            <button
              (click)="fieldToDelete.set(null)"
              class="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              (click)="deleteField()"
              [disabled]="deleting()"
              class="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {{ deleting() ? 'Removing...' : 'Remove Field' }}
            </button>
          </div>
        </div>
      </div>
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
    if (!this.newFieldName()) return;

    try {
      const fieldData: Omit<CustomFieldDefinition, 'id' | 'projectId'> = {
        name: this.newFieldName(),
        type: this.newFieldType(),
      };

      if (this.newFieldType() === 'dropdown' || this.newFieldType() === 'status') {
        fieldData.options = this.newFieldOptions();
      }

      await this.projectService.addCustomField(this.project().id, fieldData);
      this.isAdding.set(false);
    } catch (err) {
      console.error('Failed to create field', err);
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

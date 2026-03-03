import { Component, inject, signal, Output, EventEmitter, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Section } from '../../core/models/domain.model';

const COLUMN_COLORS = [
  '#64748b', // Slate
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#84cc16', // Lime
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#d946ef', // Fuchsia
  '#e040fb', // Cyber Purple
  '#00d2ff', // Cyber Blue
];

const STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
] as const;

@Component({
  selector: 'app-section-settings-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="ofx-modal-overlay" (click)="onOverlayClick($event)">
      <div class="ofx-modal" (click)="$event.stopPropagation()">
        <header class="ofx-modal-header">
          <h2 class="text-xl font-bold text-white">Column Settings</h2>
          <button class="ofx-icon-button" (click)="close.emit()">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
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
        </header>

        <form [formGroup]="form" (ngSubmit)="submit()" class="ofx-modal-body space-y-5">
          <!-- Column Name -->
          <div>
            <label class="block text-sm font-semibold text-slate-200 mb-2">Column Name</label>
            <input
              type="text"
              formControlName="name"
              placeholder="e.g., Backlog, In Review"
              class="ofx-input"
              autofocus
            />
          </div>

          <!-- Description -->
          <div>
            <label class="block text-sm font-semibold text-slate-200 mb-2"
              >Description <span class="text-slate-500 font-normal">(Optional)</span></label
            >
            <textarea
              formControlName="description"
              rows="2"
              placeholder="What kind of tasks belong here?"
              class="ofx-input"
            ></textarea>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <!-- Status Category -->
            <div>
              <label class="block text-sm font-semibold text-slate-200 mb-2">Status Category</label>
              <select formControlName="status" class="ofx-select w-full">
                @for (opt of statusOptions; track opt.value) {
                  <option [value]="opt.value">{{ opt.label }}</option>
                }
              </select>
            </div>

            <!-- WIP Limit -->
            <div>
              <label
                class="block text-sm font-semibold text-slate-200 mb-2"
                title="Work in Progress Limit"
                >WIP Limit <span class="text-slate-500 font-normal">(Optional)</span></label
              >
              <input
                type="number"
                formControlName="wipLimit"
                placeholder="No limit"
                min="1"
                class="ofx-input"
              />
            </div>
          </div>

          <!-- Color Selection -->
          <div>
            <label class="block text-sm font-semibold text-slate-200 mb-3">Color Accent</label>
            <div class="flex flex-wrap gap-2">
              @for (color of colors; track color) {
                <button
                  type="button"
                  class="ofx-color-swatch"
                  [class.selected]="form.value.color === color"
                  [style.background]="color"
                  [style.box-shadow]="
                    form.value.color === color
                      ? '0 0 0 2px rgba(255,255,255,0.9), 0 0 16px ' + color
                      : '0 0 8px ' + color + '60'
                  "
                  (click)="form.patchValue({ color })"
                  [title]="color"
                ></button>
              }
            </div>
          </div>

          <div class="pt-4 border-t border-white/10 mt-4">
            <button
              type="button"
              class="text-sm text-red-400 hover:text-red-300 transition-colors flex items-center gap-1.5"
              (click)="deleteSection()"
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
              Delete Column
            </button>
          </div>
        </form>

        <footer class="ofx-modal-footer">
          <button type="button" class="ofx-ghost-button" (click)="close.emit()">Cancel</button>
          <button
            type="submit"
            class="ofx-gradient-button"
            [disabled]="form.invalid || saving()"
            (click)="submit()"
          >
            @if (saving()) {
              <span class="flex items-center gap-2">
                <svg
                  class="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Saving...
              </span>
            } @else {
              Save Settings
            }
          </button>
        </footer>
      </div>
    </div>
  `,
  styleUrls: ['./section-settings-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionSettingsModalComponent {
  private readonly fb = inject(FormBuilder);

  section = input.required<Section>();

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<Partial<Section>>();
  @Output() delete = new EventEmitter<void>();

  colors = COLUMN_COLORS;
  statusOptions = STATUS_OPTIONS;

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(1)]],
    description: [''],
    color: ['#64748b'],
    status: ['todo', Validators.required],
    wipLimit: [null as number | null],
  });

  saving = signal(false);

  ngOnInit() {
    const s = this.section();
    this.form.patchValue({
      name: s.name,
      description: s.description || '',
      color: s.color || '#64748b',
      status: s.status || 'todo',
      wipLimit: s.wipLimit || null,
    });
  }

  onOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }

  deleteSection() {
    if (
      confirm(
        'Are you sure you want to delete this column? Tasks in this column will be preserved but lose their column assignment (appearing optionally in backlog), or you can move them before deleting. Proceed?',
      )
    ) {
      this.saving.set(true);
      this.delete.emit();
    }
  }

  submit() {
    if (this.form.invalid) return;

    this.saving.set(true);

    // Using setTimeout simply to display the loading state briefly if the parent fires quickly
    const rawValue = this.form.getRawValue();
    this.save.emit({
      name: rawValue.name || '',
      description: rawValue.description || undefined,
      color: rawValue.color || undefined,
      status: rawValue.status as 'todo' | 'in-progress' | 'done',
      wipLimit: rawValue.wipLimit ? Number(rawValue.wipLimit) : undefined,
    });
  }
}

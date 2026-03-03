import { Component, inject, signal, Output, EventEmitter, input } from '@angular/core';
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
  templateUrl: './section-settings-modal.component.html',
  styles: [
    `
      .ofx-modal-overlay {
        @apply fixed inset-0 z-50 flex items-center justify-center p-4;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
        animation: fadeIn 0.2s ease-out;
      }

      .ofx-modal {
        @apply w-full max-w-lg rounded-2xl overflow-hidden flex flex-col;
        max-height: 90vh;
        background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.95));
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow:
          0 0 0 1px rgba(0, 210, 255, 0.1),
          0 25px 50px rgba(0, 0, 0, 0.5),
          0 0 40px rgba(0, 210, 255, 0.15);
        animation: slideUp 0.25s ease-out;
      }

      .ofx-modal-header {
        @apply shrink-0 flex items-center justify-between px-6 py-5 border-b border-white/10;
        background: linear-gradient(90deg, rgba(56, 189, 248, 0.05), transparent);
      }

      .ofx-modal-body {
        @apply px-6 py-6 overflow-y-auto;

        /* Custom scrollbar */
        scrollbar-width: thin;
        scrollbar-color: rgba(148, 163, 184, 0.2) transparent;
      }

      .ofx-modal-body::-webkit-scrollbar {
        width: 6px;
      }
      .ofx-modal-body::-webkit-scrollbar-track {
        background: transparent;
      }
      .ofx-modal-body::-webkit-scrollbar-thumb {
        background-color: rgba(148, 163, 184, 0.2);
        border-radius: 3px;
      }
      .ofx-modal-body::-webkit-scrollbar-thumb:hover {
        background-color: rgba(148, 163, 184, 0.4);
      }

      .ofx-modal-footer {
        @apply shrink-0 flex justify-end gap-3 px-6 py-4 border-t border-white/10;
        background: rgba(0, 0, 0, 0.2);
      }

      .ofx-icon-button {
        @apply p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all;
      }

      .ofx-color-swatch {
        @apply w-8 h-8 rounded-lg transition-all duration-200 cursor-pointer;
        border: 2px solid transparent;
      }

      .ofx-color-swatch:hover {
        transform: scale(1.1);
      }

      .ofx-color-swatch.selected {
        transform: scale(1.15);
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
    `,
  ],
})
export class SectionSettingsModalComponent {
  private fb = inject(FormBuilder);

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

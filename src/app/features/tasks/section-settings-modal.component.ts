import { Component, inject, signal, output, input, ChangeDetectionStrategy } from '@angular/core';
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
  styleUrls: ['./section-settings-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionSettingsModalComponent {
  private readonly fb = inject(FormBuilder);

  section = input.required<Section>();

  close = output<void>();
  save = output<Partial<Section>>();
  delete = output<void>();

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

import { Component, input, output, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RecurringTask, SCHEDULE_COLORS } from '../../core/models/domain.model';
import { ScheduleService } from '../../core/services/schedule.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-recurring-task-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './recurring-task-modal.component.html',
})
export class RecurringTaskModalComponent {
  editTask = input<RecurringTask | null>(null);
  close = output<void>();
  saved = output<void>();

  scheduleService = inject(ScheduleService);
  private fb = inject(FormBuilder);

  colors = SCHEDULE_COLORS;

  availableReminders = [
    { value: 0, label: 'At time of event' },
    { value: 5, label: '5 minutes before' },
    { value: 15, label: '15 minutes before' },
    { value: 30, label: '30 minutes before' },
    { value: 60, label: '1 hour before' },
  ];

  form = this.fb.group({
    title: ['', Validators.required],
    time: ['09:00', Validators.required],
    description: [''],
    color: [SCHEDULE_COLORS[0] as string],
    enabled: [true],
    reminders: [[] as number[]],
  });

  constructor() {
    // Populate form if editing
    const task = this.editTask();
    if (task) {
      this.form.patchValue({
        title: task.title,
        time: task.time,
        description: task.description ?? '',
        color: task.color ?? (SCHEDULE_COLORS[0] as string),
        enabled: task.enabled,
        reminders: task.reminders ?? [],
      });
    }
  }

  toggleReminder(minutes: number) {
    const current = this.form.get('reminders')?.value || [];
    if (current.includes(minutes)) {
      this.form.patchValue({ reminders: current.filter((r) => r !== minutes) });
    } else {
      this.form.patchValue({ reminders: [...current, minutes] });
    }
  }

  hasReminder(minutes: number): boolean {
    return (this.form.get('reminders')?.value || []).includes(minutes);
  }

  async onSubmit() {
    if (this.form.invalid) return;
    const val = this.form.getRawValue();
    const task = this.editTask();

    if (task) {
      await this.scheduleService.updateRecurringTask(task.id, {
        title: val.title!,
        time: val.time!,
        description: val.description || undefined,
        color: val.color!,
        enabled: val.enabled!,
        reminders: val.reminders ?? [],
      });
    } else {
      await this.scheduleService.createRecurringTask({
        title: val.title!,
        time: val.time!,
        description: val.description || undefined,
        color: val.color!,
        enabled: val.enabled!,
        reminders: val.reminders ?? [],
      });
    }

    this.saved.emit();
    this.close.emit();
  }

  async onDelete() {
    const task = this.editTask();
    if (!task) return;
    await this.scheduleService.deleteRecurringTask(task.id);
    this.saved.emit();
    this.close.emit();
  }

  onBackdropClick(e: Event) {
    if (e.target === e.currentTarget) {
      this.close.emit();
    }
  }
}

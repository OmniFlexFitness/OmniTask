import { Component, input, output, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { WeeklyBlock, SCHEDULE_COLORS, AVAILABLE_REMINDERS } from '../../core/models/domain.model';
import { ScheduleService } from '../../core/services/schedule.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-weekly-block-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './weekly-block-modal.component.html',
})
export class WeeklyBlockModalComponent {
  editBlock = input<WeeklyBlock | null>(null);
  /** Pre-selected day (0-6) when creating from grid click */
  preselectedDay = input<number | null>(null);
  /** Pre-selected start time when creating from grid click */
  preselectedTime = input<string | null>(null);
  /** Week date for one-time blocks (ISO Monday date) */
  currentWeekDate = input<string>('');

  close = output<void>();
  saved = output<void>();

  scheduleService = inject(ScheduleService);
  private fb = inject(FormBuilder);

  colors = SCHEDULE_COLORS;

  dayLabels = [
    { short: 'Sun', value: 0 },
    { short: 'Mon', value: 1 },
    { short: 'Tue', value: 2 },
    { short: 'Wed', value: 3 },
    { short: 'Thu', value: 4 },
    { short: 'Fri', value: 5 },
    { short: 'Sat', value: 6 },
  ];

  availableReminders = AVAILABLE_REMINDERS;

  form = this.fb.group({
    title: ['', Validators.required],
    dayOfWeek: [1],
    startTime: ['09:00', Validators.required],
    endTime: ['10:00', Validators.required],
    description: [''],
    color: [SCHEDULE_COLORS[1] as string],
    repeating: [true],
    reminders: [[] as number[]],
  });

  constructor() {
    const block = this.editBlock();
    if (block) {
      this.form.patchValue({
        title: block.title,
        dayOfWeek: block.dayOfWeek,
        startTime: block.startTime,
        endTime: block.endTime,
        description: block.description ?? '',
        color: block.color ?? (SCHEDULE_COLORS[1] as string),
        repeating: block.repeating,
        reminders: block.reminders ?? [],
      });
    } else {
      // Apply preselected values from grid click
      const day = this.preselectedDay();
      if (day !== null && day !== undefined) {
        this.form.patchValue({ dayOfWeek: day });
      }
      const time = this.preselectedTime();
      if (time) {
        const [h, m] = time.split(':').map(Number);
        const endH = Math.min(h + 1, 23);
        this.form.patchValue({
          startTime: time,
          endTime: `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        });
      }
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
    const block = this.editBlock();

    const data: Record<string, unknown> = {
      title: val.title!,
      dayOfWeek: val.dayOfWeek!,
      startTime: val.startTime!,
      endTime: val.endTime!,
      description: val.description || undefined,
      color: val.color!,
      repeating: val.repeating!,
      reminders: val.reminders ?? [],
    };

    // Set weekDate for one-time blocks
    if (!val.repeating && this.currentWeekDate()) {
      data['weekDate'] = this.currentWeekDate();
    }

    if (block) {
      await this.scheduleService.updateWeeklyBlock(block.id, data as Partial<WeeklyBlock>);
    } else {
      await this.scheduleService.createWeeklyBlock(
        data as Omit<WeeklyBlock, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
      );
    }

    this.saved.emit();
    this.close.emit();
  }

  async onDelete() {
    const block = this.editBlock();
    if (!block) return;
    await this.scheduleService.deleteWeeklyBlock(block.id);
    this.saved.emit();
    this.close.emit();
  }

  onBackdropClick(e: Event) {
    if (e.target === e.currentTarget) {
      this.close.emit();
    }
  }
}

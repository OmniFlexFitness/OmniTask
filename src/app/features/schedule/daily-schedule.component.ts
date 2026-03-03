import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { RecurringTask, SCHEDULE_COLORS } from '../../core/models/domain.model';
import { ScheduleService } from '../../core/services/schedule.service';
import { RecurringTaskModalComponent } from './recurring-task-modal.component';

@Component({
  selector: 'app-daily-schedule',
  standalone: true,
  imports: [CommonModule, RecurringTaskModalComponent],
  templateUrl: './daily-schedule.component.html',
})
export class DailyScheduleComponent {
  private scheduleService = inject(ScheduleService);

  tasks = toSignal(this.scheduleService.getRecurringTasks(), { initialValue: [] });

  showModal = signal(false);
  editingTask = signal<RecurringTask | null>(null);

  openCreate() {
    this.editingTask.set(null);
    this.showModal.set(true);
  }

  openEdit(task: RecurringTask) {
    this.editingTask.set(task);
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingTask.set(null);
  }

  async toggleEnabled(task: RecurringTask) {
    await this.scheduleService.updateRecurringTask(task.id, { enabled: !task.enabled });
  }

  formatTime(time: string): string {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  }
}

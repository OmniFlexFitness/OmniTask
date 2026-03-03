import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { WeeklyBlock } from '../../core/models/domain.model';
import { ScheduleService } from '../../core/services/schedule.service';
import { WeeklyBlockModalComponent } from './weekly-block-modal.component';

@Component({
  selector: 'app-weekly-schedule',
  standalone: true,
  imports: [CommonModule, WeeklyBlockModalComponent],
  templateUrl: './weekly-schedule.component.html',
  styleUrls: ['./weekly-schedule.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WeeklyScheduleComponent {
  private readonly scheduleService = inject(ScheduleService);

  allBlocks = toSignal(this.scheduleService.getWeeklyBlocks(), { initialValue: [] });

  /** The Monday of the currently viewed week */
  currentMonday = signal(this.getMondayOfWeek(new Date()));

  showModal = signal(false);
  editingBlock = signal<WeeklyBlock | null>(null);
  preselectedDay = signal<number | null>(null);
  preselectedTime = signal<string | null>(null);

  hours = Array.from({ length: 17 }, (_, i) => i + 6); // 6:00 to 22:00
  dayIndices = [0, 1, 2, 3, 4, 5, 6]; // Sun-Sat

  currentMondayISO = computed(() => {
    const d = this.currentMonday();
    return d.toISOString().slice(0, 10);
  });

  weekRangeLabel = computed(() => {
    const mon = this.currentMonday();
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `${fmt(mon)} – ${fmt(sun)}`;
  });

  dayHeaders = computed(() => {
    const mon = this.currentMonday();
    const today = new Date();
    // Reorder to Sun=0..Sat=6
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return labels.map((label, idx) => {
      // Calculate date for this day: Monday is dayIdx=1
      const offset = idx === 0 ? 6 : idx - 1; // Sun is 6 days after Monday
      const date = new Date(mon);
      date.setDate(date.getDate() + offset);
      const isToday = date.toDateString() === today.toDateString();
      return {
        label,
        dateStr: date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
        isToday,
      };
    });
  });

  /** Blocks visible for the current week (repeating + one-time matching this week) */
  visibleBlocks = computed(() => {
    const mondayISO = this.currentMondayISO();
    return this.allBlocks().filter((b) => {
      if (b.repeating) return true;
      return b.weekDate === mondayISO;
    });
  });

  getBlocksForCell(dayIdx: number, hour: number): WeeklyBlock[] {
    return this.visibleBlocks().filter((b) => {
      if (b.dayOfWeek !== dayIdx) return false;
      const startH = parseInt(b.startTime.split(':')[0], 10);
      return startH === hour;
    });
  }

  getBlockTopOffset(block: WeeklyBlock, hour: number): number {
    const startM = parseInt(block.startTime.split(':')[1], 10);
    return (startM / 60) * 48; // 48px per hour
  }

  getBlockHeight(block: WeeklyBlock): number {
    const [sh, sm] = block.startTime.split(':').map(Number);
    const [eh, em] = block.endTime.split(':').map(Number);
    const totalMinutes = eh * 60 + em - (sh * 60 + sm);
    return Math.max((totalMinutes / 60) * 48, 24); // min 24px
  }

  formatHour(hour: number): string {
    const period = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return `${h12} ${period}`;
  }

  navigateWeek(delta: number) {
    const newDate = new Date(this.currentMonday());
    newDate.setDate(newDate.getDate() + delta * 7);
    this.currentMonday.set(newDate);
  }

  goToCurrentWeek() {
    this.currentMonday.set(this.getMondayOfWeek(new Date()));
  }

  onCellClick(dayIdx: number, hour: number) {
    this.preselectedDay.set(dayIdx);
    this.preselectedTime.set(`${String(hour).padStart(2, '0')}:00`);
    this.editingBlock.set(null);
    this.showModal.set(true);
  }

  openCreateBlock() {
    this.preselectedDay.set(null);
    this.preselectedTime.set(null);
    this.editingBlock.set(null);
    this.showModal.set(true);
  }

  openEditBlock(block: WeeklyBlock) {
    this.editingBlock.set(block);
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingBlock.set(null);
    this.preselectedDay.set(null);
    this.preselectedTime.set(null);
  }

  private getMondayOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    // getDay(): 0=Sun. We want Monday=start.
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}

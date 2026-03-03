import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { WeeklyBlock } from '../../core/models/domain.model';
import { ScheduleService } from '../../core/services/schedule.service';
import { WeeklyBlockModalComponent } from './weekly-block-modal.component';

@Component({
  selector: 'app-weekly-schedule',
  standalone: true,
  imports: [CommonModule, WeeklyBlockModalComponent],
  template: `
    <div class="h-full flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-4">
          <h2 class="text-xl font-bold text-white" style="font-family: 'Orbitron', sans-serif;">
            Weekly Schedule
          </h2>
          <!-- Week navigation -->
          <div
            class="flex items-center gap-2 bg-slate-800/60 rounded-lg p-0.5 border border-white/10"
          >
            <button
              class="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
              (click)="navigateWeek(-1)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M12.707 5.293a1 1 0 010 1.414L8.414 12l4.293 4.293a1 1 0 01-1.414 1.414l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 0z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>
            <button
              class="px-3 py-1 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 rounded transition-colors"
              (click)="goToCurrentWeek()"
            >
              This Week
            </button>
            <button
              class="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
              (click)="navigateWeek(1)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L11.586 12 7.293 7.707a1 1 0 011.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>
          </div>
          <span class="text-sm text-slate-400">{{ weekRangeLabel() }}</span>
        </div>

        <button
          class="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded-lg transition-all shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:scale-105"
          (click)="openCreateBlock()"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
              clip-rule="evenodd"
            />
          </svg>
          Add Block
        </button>
      </div>

      <!-- Legend -->
      <div class="flex gap-4 mb-3 text-xs text-slate-400">
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-sm bg-cyan-500/40 border border-cyan-500/60"></span>
          Repeating
        </div>
        <div class="flex items-center gap-1.5">
          <span
            class="w-3 h-3 rounded-sm bg-cyan-500/20 border border-dashed border-cyan-500/40"
          ></span>
          One-time
        </div>
      </div>

      <!-- Grid -->
      <div class="flex-1 overflow-auto rounded-xl border border-white/10 bg-slate-900/30">
        <div class="min-w-[700px]">
          <!-- Day headers -->
          <div
            class="grid grid-cols-[60px_repeat(7,1fr)] border-b border-white/10 bg-slate-800/30 sticky top-0 z-10"
          >
            <div class="p-2 text-center text-xs text-slate-500"></div>
            @for (day of dayHeaders(); track day.label) {
              <div
                class="p-2 text-center text-xs font-medium uppercase tracking-wider"
                [class.text-cyan-400]="day.isToday"
                [class.text-slate-400]="!day.isToday"
              >
                <div>{{ day.label }}</div>
                <div
                  class="text-[10px] mt-0.5 font-normal"
                  [class.text-cyan-300]="day.isToday"
                  [class.text-slate-500]="!day.isToday"
                >
                  {{ day.dateStr }}
                </div>
              </div>
            }
          </div>

          <!-- Time rows -->
          @for (hour of hours; track hour) {
            <div class="grid grid-cols-[60px_repeat(7,1fr)] border-b border-white/5 group/row">
              <!-- Hour label -->
              <div
                class="p-2 text-right text-[11px] font-mono text-slate-500 border-r border-white/5"
              >
                {{ formatHour(hour) }}
              </div>
              <!-- Day cells -->
              @for (dayIdx of dayIndices; track dayIdx) {
                <div
                  class="relative min-h-[48px] border-r border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer"
                  (click)="onCellClick(dayIdx, hour)"
                >
                  <!-- Blocks in this cell -->
                  @for (block of getBlocksForCell(dayIdx, hour); track block.id) {
                    <button
                      class="absolute left-0.5 right-0.5 rounded-md px-2 py-1 text-[11px] font-medium text-white truncate z-10 transition-all hover:brightness-110 hover:z-20 hover:shadow-lg"
                      [style.top.px]="getBlockTopOffset(block, hour)"
                      [style.height.px]="getBlockHeight(block)"
                      [style.background-color]="(block.color || '#06b6d4') + '40'"
                      [style.border-left]="'3px solid ' + (block.color || '#06b6d4')"
                      [class.border]="block.repeating"
                      [class.border-dashed]="!block.repeating"
                      [style.border-color]="(block.color || '#06b6d4') + '60'"
                      (click)="$event.stopPropagation(); openEditBlock(block)"
                    >
                      <span class="block truncate">{{ block.title }}</span>
                      <span class="block text-[9px] opacity-70"
                        >{{ block.startTime }}–{{ block.endTime }}</span
                      >
                    </button>
                  }
                </div>
              }
            </div>
          }
        </div>
      </div>

      <!-- Modal -->
      @if (showModal()) {
        <app-weekly-block-modal
          [editBlock]="editingBlock()"
          [preselectedDay]="preselectedDay()"
          [preselectedTime]="preselectedTime()"
          [currentWeekDate]="currentMondayISO()"
          (close)="closeModal()"
          (saved)="closeModal()"
        />
      }
    </div>
  `,
  styleUrls: ['./weekly-schedule.component.css'],
})
export class WeeklyScheduleComponent {
  private scheduleService = inject(ScheduleService);

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

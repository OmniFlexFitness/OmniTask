import {
  Component,
  forwardRef,
  signal,
  computed,
  inject,
  ElementRef,
  HostListener,
  effect,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { OverlayModule } from '@angular/cdk/overlay';

@Component({
  selector: 'app-custom-date-picker',
  standalone: true,
  imports: [CommonModule, OverlayModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomDatePickerComponent),
      multi: true,
    },
  ],
  template: `
    <div class="relative w-full" [class.opacity-50]="isDisabled()">
      <!-- Trigger -->
      <button
        type="button"
        (click)="toggleOpen()"
        [disabled]="isDisabled()"
        class="w-full flex items-center justify-between bg-slate-950/50 border rounded-lg px-3 py-2 text-sm transition-all duration-200"
        [ngClass]="{
          'border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.2)]': isOpen(),
          'border-white/10 hover:border-white/20': !isOpen(),
        }"
        cdkOverlayOrigin
        #trigger="cdkOverlayOrigin"
      >
        <span [class.text-slate-300]="value()" [class.text-slate-500]="!value()">
          {{ displayValue() || placeholder() }}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4 text-cyan-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </button>

      <!-- Calendar Overlay -->
      <ng-template
        cdkConnectedOverlay
        [cdkConnectedOverlayOrigin]="trigger"
        [cdkConnectedOverlayOpen]="isOpen()"
        [cdkConnectedOverlayHasBackdrop]="true"
        cdkConnectedOverlayBackdropClass="cdk-overlay-transparent-backdrop"
        (backdropClick)="close()"
        [cdkConnectedOverlayPositions]="[
          { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
          { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
        ]"
      >
        <div
          class="bg-[#0a0f1e]/95  border border-white/10 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-4 w-[280px] animate-in fade-in zoom-in-95 duration-200 origin-top z-50"
        >
          <!-- Calendar Header -->
          <div class="flex items-center justify-between mb-4">
            <button
              type="button"
              (click)="prevMonth()"
              class="p-1 hover:bg-white/10 rounded-md text-slate-400 hover:text-white transition-colors"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <span class="font-bold text-sm text-slate-200 tracking-wide">{{
              monthYearDisplay()
            }}</span>
            <button
              type="button"
              (click)="nextMonth()"
              class="p-1 hover:bg-white/10 rounded-md text-slate-400 hover:text-white transition-colors"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>

          <!-- Week Days -->
          <div class="grid grid-cols-7 gap-1 mb-2">
            @for (day of ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']; track day) {
              <div class="text-[10px] font-bold text-slate-500 text-center uppercase">
                {{ day }}
              </div>
            }
          </div>

          <!-- Calendar Days -->
          <div class="grid grid-cols-7 gap-1">
            @for (dateObj of calendarDays(); track dateObj.date.getTime()) {
              <button
                type="button"
                (click)="selectDate(dateObj.date)"
                class="h-8 w-8 rounded-full flex items-center justify-center text-xs transition-all relative group"
                [ngClass]="{
                  'text-slate-600': !dateObj.isCurrentMonth,
                  'text-slate-300 hover:bg-white/10 hover:text-cyan-300':
                    dateObj.isCurrentMonth && !dateObj.isSelected,
                  'bg-cyan-500 text-slate-900 font-bold shadow-[0_0_10px_rgba(6,182,212,0.5)]':
                    dateObj.isSelected,
                  'border border-cyan-500/50': dateObj.isToday && !dateObj.isSelected,
                }"
              >
                {{ dateObj.date.getDate() }}
              </button>
            }
          </div>

          <!-- Footer -->
          <div class="mt-4 pt-3 border-t border-white/5 flex justify-between">
            <button
              type="button"
              (click)="clear()"
              class="text-xs text-slate-400 hover:text-rose-400 transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              (click)="selectToday()"
              class="text-xs text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
            >
              Today
            </button>
          </div>
        </div>
      </ng-template>
    </div>
  `,
})
export class CustomDatePickerComponent implements ControlValueAccessor {
  placeholder = input<string>('mm/dd/yyyy');
  valueInput = input<string | Date | null>(null, { alias: 'value' });
  valueChange = output<string | null>();

  value = signal<Date | null>(null);
  viewDate = signal<Date>(new Date());
  isOpen = signal(false);
  isDisabled = signal(false);

  constructor() {
    effect(
      () => {
        const val = this.valueInput();
        if (val !== undefined) {
          this.writeValue(val);
        }
      },
      { allowSignalWrites: true },
    );
  }

  // Month formatting
  monthYearDisplay = computed(() => {
    return this.viewDate().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  });

  // Selected value display
  displayValue = computed(() => {
    const val = this.value();
    if (!val) return '';
    return val.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  });

  calendarDays = computed(() => {
    const viewDate = this.viewDate();
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const days: { date: Date; isCurrentMonth: boolean; isSelected: boolean; isToday: boolean }[] =
      [];

    // Previous month padding
    const startDayOfWeek = firstDayOfMonth.getDay();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push(this.createDayObject(new Date(year, month, -i), false));
    }

    // Current month
    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
      days.push(this.createDayObject(new Date(year, month, i), true));
    }

    // Next month padding
    const endDayOfWeek = lastDayOfMonth.getDay();
    let nextMonthDays = 6 - endDayOfWeek;
    if (days.length + nextMonthDays < 42) {
      nextMonthDays += 7;
    }

    for (let i = 1; i <= nextMonthDays; i++) {
      days.push(this.createDayObject(new Date(year, month + 1, i), false));
    }

    return days;
  });

  private createDayObject(date: Date, isCurrentMonth: boolean) {
    const today = new Date();
    const val = this.value();

    const isToday =
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();

    const isSelected = val
      ? date.getDate() === val.getDate() &&
        date.getMonth() === val.getMonth() &&
        date.getFullYear() === val.getFullYear()
      : false;

    return { date, isCurrentMonth, isSelected, isToday };
  }

  // CVA implementations
  onChange: any = () => {};
  onTouch: any = () => {};

  writeValue(obj: any): void {
    if (obj) {
      // Handle string format "YYYY-MM-DD"
      if (typeof obj === 'string') {
        const parts = obj.split('-');
        if (parts.length === 3) {
          const d = new Date(
            parseInt(parts[0], 10),
            parseInt(parts[1], 10) - 1,
            parseInt(parts[2], 10),
          );
          if (!isNaN(d.getTime())) {
            this.value.set(d);
            this.viewDate.set(new Date(d.getTime()));
            return;
          }
        }
      } else {
        const d = new Date(obj);
        if (!isNaN(d.getTime())) {
          this.value.set(d);
          this.viewDate.set(new Date(d.getTime()));
          return;
        }
      }
    }
    this.value.set(null);
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouch = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
  }

  // Actions
  toggleOpen() {
    if (this.isDisabled()) return;
    if (!this.isOpen()) {
      // Reset view date to selected value or today when opening
      const val = this.value();
      this.viewDate.set(val ? new Date(val.getTime()) : new Date());
    }
    this.isOpen.update((v) => !v);
  }

  close() {
    this.isOpen.set(false);
    this.onTouch();
  }

  prevMonth() {
    const d = new Date(this.viewDate());
    d.setMonth(d.getMonth() - 1);
    this.viewDate.set(d);
  }

  nextMonth() {
    const d = new Date(this.viewDate());
    d.setMonth(d.getMonth() + 1);
    this.viewDate.set(d);
  }

  selectDate(date: Date) {
    this.value.set(date);
    const dateStr = this.formatDate(date);
    this.onChange(dateStr);
    this.valueChange.emit(dateStr);
    this.close();
  }

  selectToday() {
    this.selectDate(new Date());
  }

  clear() {
    this.value.set(null);
    this.onChange(null);
    this.valueChange.emit(null);
    this.close();
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

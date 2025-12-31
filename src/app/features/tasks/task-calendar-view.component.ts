import { Component, input, output, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Task } from '../../core/models/domain.model';

@Component({
  selector: 'app-task-calendar-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="h-full flex flex-col bg-slate-900/30 rounded-xl border border-white/5">
      <!-- Calendar Header -->
      <div class="p-4 flex items-center justify-between border-b border-white/10">
        <div class="flex items-center gap-4">
          <h2 class="text-lg font-bold text-white">{{ monthTitle() }}</h2>
          <div class="flex bg-slate-800 rounded-lg p-0.5 border border-white/10">
            <button 
              class="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
              (click)="navigateMonth(-1)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L8.414 12l4.293 4.293a1 1 0 01-1.414 1.414l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
            </button>
            <button 
              class="px-3 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 rounded transition-colors"
              (click)="resetToToday()"
            >
              Today
            </button>
            <button 
              class="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
              (click)="navigateMonth(1)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L11.586 12 7.293 7.707a1 1 0 011.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Days Header -->
      <div class="grid grid-cols-7 border-b border-white/10 bg-slate-800/20">
        @for (day of weekDays; track day) {
          <div class="py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
            {{ day }}
          </div>
        }
      </div>

      <!-- Calendar Grid -->
      <div class="flex-1 grid grid-cols-7 grid-rows-6 h-full">
        @for (date of calendarDays(); track date.iso) {
          <div 
            class="border-b border-r border-white/5 relative p-1 group flex flex-col gap-1 transition-colors min-h-[0]"
            [class.bg-slate-900]="!date.isCurrentMonth"
            [class.text-slate-600]="!date.isCurrentMonth"
            [class.hover:bg-white/5]="true"
            (click)="onDateClick(date.date)"
          >
            <div class="flex justify-between items-start p-1">
              <span 
                class="text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full"
                [class.bg-cyan-500]="isToday(date.date)"
                [class.text-white]="isToday(date.date)"
                [class.text-slate-400]="!isToday(date.date)"
              >
                {{ date.day }}
              </span>
            </div>

            <!-- Tasks for this day -->
            <div class="flex flex-col gap-1 overflow-y-auto px-1 scrollbar-none">
              @for (task of getTasksForDate(date.date); track task.id) {
                <button
                  class="text-left text-[10px] px-1.5 py-1 rounded border border-l-2 truncate transition-all w-full"
                  [ngClass]="{
                    'bg-emerald-500/10 border-emerald-500/20 border-l-emerald-500 text-emerald-200': task.status === 'done',
                    'bg-slate-800 border-white/10 border-l-amber-500 text-slate-300': task.status !== 'done' && task.priority === 'medium',
                    'bg-slate-800 border-white/10 border-l-rose-500 text-slate-300': task.status !== 'done' && task.priority === 'high',
                    'bg-slate-800 border-white/10 border-l-emerald-400 text-slate-300': task.status !== 'done' && task.priority === 'low'
                   }"
                  [class.opacity-60]="task.status === 'done'"
                  [class.line-through]="task.status === 'done'"
                  (click)="$event.stopPropagation(); taskClick.emit(task)"
                >
                  {{ task.title }}
                </button>
              }
            </div>
            
            <!-- Add button on hover -->
            <button 
              class="absolute bottom-1 right-1 p-1 rounded-full bg-cyan-500 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 shadow-lg"
              title="Add task"
              (click)="$event.stopPropagation(); addTaskForDate.emit(date.date)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .scrollbar-none::-webkit-scrollbar {
      display: none;
    }
  `]
})
export class TaskCalendarViewComponent {
  tasks = input.required<Task[]>();
  taskClick = output<Task>();
  addTaskForDate = output<Date>();

  currentDate = signal(new Date());

  weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  monthTitle = computed(() => {
    return this.currentDate().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  });

  calendarDays = computed(() => {
    const year = this.currentDate().getFullYear();
    const month = this.currentDate().getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    const daysInMonth = lastDayOfMonth.getDate();
    const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday
    
    const days: { date: Date; day: number; isCurrentMonth: boolean; iso: string }[] = [];
    
    // Previous month (padding)
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      days.push({ 
        date, 
        day: date.getDate(), 
        isCurrentMonth: false,
        iso: date.toISOString() 
      });
    }
    
    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      days.push({ 
        date, 
        day: i, 
        isCurrentMonth: true,
        iso: date.toISOString()
      });
    }
    
    // Next month (padding to fill 6 rows = 42 cells)
    const remainingCells = 42 - days.length;
    for (let i = 1; i <= remainingCells; i++) {
      const date = new Date(year, month + 1, i);
      days.push({ 
        date, 
        day: i, 
        isCurrentMonth: false,
        iso: date.toISOString()
      });
    }
    
    return days;
  });

  navigateMonth(delta: number) {
    const newDate = new Date(this.currentDate());
    newDate.setMonth(newDate.getMonth() + delta);
    this.currentDate.set(newDate);
  }

  resetToToday() {
    this.currentDate.set(new Date());
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  }

  getTasksForDate(date: Date): Task[] {
    return this.tasks().filter(task => {
      if (!task.dueDate) return false;
      const dateVal: any = task.dueDate;
      const tDate = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
      return tDate.getDate() === date.getDate() &&
             tDate.getMonth() === date.getMonth() &&
             tDate.getFullYear() === date.getFullYear();
    });
  }
  
  onDateClick(date: Date) {
    // Optional: maybe select the date or switch to day view?
    // For now we just emit the add intention
    this.addTaskForDate.emit(date);
  }
}

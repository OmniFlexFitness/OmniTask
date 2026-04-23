import { Component, input, output, computed, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Task } from '../../core/models/domain.model';

@Component({
  selector: 'app-task-calendar-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './task-calendar-view.component.html',
  styleUrls: ['./task-calendar-view.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
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

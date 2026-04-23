import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskCalendarViewComponent } from './task-calendar-view.component';
import { generateMockTask } from '../../../testing/mock-data';
import { ComponentRef } from '@angular/core';

describe('TaskCalendarViewComponent', () => {
  let component: TaskCalendarViewComponent;
  let fixture: ComponentFixture<TaskCalendarViewComponent>;
  let componentRef: ComponentRef<TaskCalendarViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskCalendarViewComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskCalendarViewComponent);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;

    // Provide some tasks
    componentRef.setInput('tasks', [
      generateMockTask({ id: 't1', dueDate: new Date() as any }),
      generateMockTask({ id: 't2', dueDate: new Date(Date.now() + 86400000) as any }), // tomorrow
    ]);

    // Force date to a specific point for deterministic tests (Jan 2026)
    component.currentDate.set(new Date(2026, 0, 15)); // Jan 15, 2026

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should format month title correctly', () => {
    expect(component.monthTitle()).toContain('January');
    expect(component.monthTitle()).toContain('2026');
  });

  it('should generate 42 calendar days', () => {
    const days = component.calendarDays();
    expect(days.length).toBe(42);
    // Jan 2026 starts on a Thursday (4)
    // The first day of the grid should be Sunday Dec 28 2025
    expect(days[0].day).toBe(28);
    expect(days[0].isCurrentMonth).toBeFalse();

    // The 5th element should be Jan 1
    expect(days[4].day).toBe(1);
    expect(days[4].isCurrentMonth).toBeTrue();
  });

  it('should navigate months forward and backward', () => {
    // Current is Jan 2026
    component.navigateMonth(1);
    expect(component.currentDate().getMonth()).toBe(1); // Feb
    expect(component.currentDate().getFullYear()).toBe(2026);
    expect(component.monthTitle()).toContain('February');

    component.navigateMonth(-2);
    expect(component.currentDate().getMonth()).toBe(11); // Dec
    expect(component.currentDate().getFullYear()).toBe(2025);
    expect(component.monthTitle()).toContain('December');
  });

  it('should reset to today', () => {
    component.resetToToday();
    const today = new Date();
    expect(component.currentDate().getDate()).toBe(today.getDate());
    expect(component.currentDate().getMonth()).toBe(today.getMonth());
    expect(component.currentDate().getFullYear()).toBe(today.getFullYear());
  });

  it('should format isToday correctly', () => {
    const today = new Date();
    expect(component.isToday(today)).toBeTrue();
    const yesterday = new Date(today.getTime() - 86400000);
    expect(component.isToday(yesterday)).toBeFalse();
  });

  it('should get tasks for a specific date', () => {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 86400000);

    const tasksToday = component.getTasksForDate(today);
    expect(tasksToday.length).toBe(1);
    expect(tasksToday[0].id).toBe('t1');

    const tasksTomorrow = component.getTasksForDate(tomorrow);
    expect(tasksTomorrow.length).toBe(1);
    expect(tasksTomorrow[0].id).toBe('t2');

    const tasksNextWeek = component.getTasksForDate(new Date(today.getTime() + 7 * 86400000));
    expect(tasksNextWeek.length).toBe(0);
  });

  it('should emit addTaskForDate when date is clicked', () => {
    spyOn(component.addTaskForDate, 'emit');
    const today = new Date();
    component.onDateClick(today);
    expect(component.addTaskForDate.emit).toHaveBeenCalledWith(today);
  });
});

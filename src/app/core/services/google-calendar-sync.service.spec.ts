import { TestBed } from '@angular/core/testing';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';
import { Task } from '../models/domain.model';
import { Firestore } from '@angular/fire/firestore';
import { GoogleCalendarService } from './google-calendar.service';
import { AuthService } from '../auth/auth.service';

describe('GoogleCalendarSyncService', () => {
  let service: GoogleCalendarSyncService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        GoogleCalendarSyncService,
        { provide: Firestore, useValue: {} },
        { provide: GoogleCalendarService, useValue: {} },
        { provide: AuthService, useValue: { currentUserSig: () => null } },
      ],
    });
    service = TestBed.inject(GoogleCalendarSyncService);
  });

  it('taskToCalendarEvent maps due date to all-day event with exclusive end date', () => {
    const task: Task = {
      id: 't1',
      projectId: 'p1',
      title: 'Ship feature',
      description: 'Details',
      status: 'todo',
      priority: 'medium',
      order: 0,
      dueDate: new Date(2026, 5, 12),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const event = service.taskToCalendarEvent(task);
    expect(event.summary).toBe('Ship feature');
    expect(event.start?.date).toBe('2026-06-12');
    expect(event.end?.date).toBe('2026-06-13');
    expect(event.extendedProperties?.private?.omniTaskId).toBe('t1');
  });

  it('calendarEventDueDate reads all-day start date', () => {
    const due = service.calendarEventDueDate({ start: { date: '2026-06-12' } });
    expect(due?.getFullYear()).toBe(2026);
    expect(due?.getMonth()).toBe(5);
    expect(due?.getDate()).toBe(12);
  });
});

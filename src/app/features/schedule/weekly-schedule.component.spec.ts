import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WeeklyScheduleComponent } from './weekly-schedule.component';
import { ScheduleService } from '../../core/services/schedule.service';
import { of } from 'rxjs';
import { WeeklyBlock } from '../../core/models/domain.model';

describe('WeeklyScheduleComponent', () => {
  let component: WeeklyScheduleComponent;
  let fixture: ComponentFixture<WeeklyScheduleComponent>;
  let mockScheduleService: jasmine.SpyObj<ScheduleService>;

  const mockBlocks: WeeklyBlock[] = [
    {
      id: 'b1',
      title: 'Morning Routine',
      dayOfWeek: 1, // Monday
      startTime: '08:00',
      endTime: '09:00',
      color: '#ff0000',
      repeating: true,
      userId: 'user1',
      createdAt: { toDate: () => new Date() } as any,
      updatedAt: { toDate: () => new Date() } as any,
    },
    {
      id: 'b2',
      title: 'One time meeting',
      dayOfWeek: 2, // Tuesday
      startTime: '10:00',
      endTime: '11:30',
      color: '#00ff00',
      repeating: false,
      weekDate: '2026-01-19',
      userId: 'user1',
      createdAt: { toDate: () => new Date() } as any,
      updatedAt: { toDate: () => new Date() } as any,
    },
  ];

  beforeEach(async () => {
    mockScheduleService = jasmine.createSpyObj('ScheduleService', ['getWeeklyBlocks']);
    mockScheduleService.getWeeklyBlocks.and.returnValue(of(mockBlocks));

    await TestBed.configureTestingModule({
      imports: [WeeklyScheduleComponent],
      providers: [{ provide: ScheduleService, useValue: mockScheduleService }],
    }).compileComponents();

    fixture = TestBed.createComponent(WeeklyScheduleComponent);
    component = fixture.componentInstance;

    // Set fixed current date for deterministic testing: Jan 21, 2026 (Wednesday)
    // The monday of that week is Jan 19, 2026
    const testDate = new Date(2026, 0, 21);

    // override getMondayOfWeek indirectly by navigating to it
    const diff = testDate.getDay() === 0 ? -6 : 1 - testDate.getDay();
    testDate.setDate(testDate.getDate() + diff);
    testDate.setHours(0, 0, 0, 0);
    component.currentMonday.set(testDate);

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(component.allBlocks().length).toBe(2);
  });

  it('should calculate current monday properly via getters', () => {
    expect(component.currentMondayISO()).toBe('2026-01-19');
    expect(component.weekRangeLabel()).toContain('Jan 19');
    expect(component.weekRangeLabel()).toContain('Jan 25');
  });

  it('should generate day headers', () => {
    const headers = component.dayHeaders();
    expect(headers.length).toBe(7);
    expect(headers[0].label).toBe('Sun');
    // Sunday in that week is Jan 25
    expect(headers[0].dateStr).toBe('1/25');

    expect(headers[1].label).toBe('Mon');
    expect(headers[1].dateStr).toBe('1/19');
  });

  it('should filter visible blocks', () => {
    // Both b1 (repeating) and b2 (one-time for weekDate 2026-01-19) should be visible
    expect(component.visibleBlocks().length).toBe(2);

    // change week
    component.navigateWeek(1); // 2026-01-26
    fixture.detectChanges();
    // b1 should still be visible, b2 should not be
    expect(component.visibleBlocks().length).toBe(1);
    expect(component.visibleBlocks()[0].id).toBe('b1');
  });

  it('should get blocks for cell', () => {
    // b1 is Monday (1) at 08:00
    const blocks1 = component.getBlocksForCell(1, 8);
    expect(blocks1.length).toBe(1);
    expect(blocks1[0].id).toBe('b1');

    const blocks2 = component.getBlocksForCell(1, 9);
    expect(blocks2.length).toBe(0);
  });

  it('should calculate styles correctly', () => {
    // b2 is 10:00 to 11:30 (1.5 hours)
    const block = mockBlocks[1];

    const offset = component.getBlockTopOffset(block, 10);
    expect(offset).toBe(0); // 10:00 starts at top of 10:xx cell

    const height = component.getBlockHeight(block);
    expect(height).toBe(1.5 * 48); // 72px
  });

  it('should open and close modal', () => {
    component.openCreateBlock();
    expect(component.showModal()).toBeTrue();
    expect(component.editingBlock()).toBeNull();

    component.closeModal();
    expect(component.showModal()).toBeFalse();

    component.openEditBlock(mockBlocks[0]);
    expect(component.showModal()).toBeTrue();
    expect(component.editingBlock()).toEqual(mockBlocks[0]);
  });

  it('should preselect day and time on cell click', () => {
    component.onCellClick(3, 14); // Wednesday, 2 PM
    expect(component.showModal()).toBeTrue();
    expect(component.preselectedDay()).toBe(3);
    expect(component.preselectedTime()).toBe('14:00');
  });
});

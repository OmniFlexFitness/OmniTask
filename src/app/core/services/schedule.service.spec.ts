import { TestBed } from '@angular/core/testing';
import { ScheduleService } from './schedule.service';
import { AuthService } from '../auth/auth.service';
import * as firestore from '@angular/fire/firestore';
import { Firestore } from '@angular/fire/firestore';
import { signal } from '@angular/core';
import { of } from 'rxjs';

// Create a generic spy object for Firestore
const firestoreMock = {} as any;
Object.setPrototypeOf(firestoreMock, Firestore.prototype);

describe('ScheduleService', () => {
  let service: ScheduleService;
  let mockAuthService: jasmine.SpyObj<AuthService>;

  const safeSpy = (obj: any, method: string) =>
    obj[method]?.and ? obj[method] : spyOn(obj, method);

  beforeEach(() => {
    mockAuthService = jasmine.createSpyObj('AuthService', [], {
      currentUserSig: signal({ uid: 'test-user-123' }),
    });

    TestBed.configureTestingModule({
      providers: [
        ScheduleService,
        { provide: AuthService, useValue: mockAuthService },
        { provide: Firestore, useValue: firestoreMock },
      ],
    });
    service = TestBed.inject(ScheduleService);
  });

  afterEach(() => {
    // Reset all spies on the firestore module to prevent leaks between tests
    if ((firestore as any).addDoc?.and) (firestore as any).addDoc.calls.reset();
    if ((firestore as any).updateDoc?.and) (firestore as any).updateDoc.calls.reset();
    if ((firestore as any).deleteDoc?.and) (firestore as any).deleteDoc.calls.reset();
    if ((firestore as any).collection?.and) (firestore as any).collection.calls.reset();
    if ((firestore as any).doc?.and) (firestore as any).doc.calls.reset();
    if ((firestore as any).query?.and) (firestore as any).query.calls.reset();
    if ((firestore as any).orderBy?.and) (firestore as any).orderBy.calls.reset();
    if ((firestore as any).collectionData?.and) (firestore as any).collectionData.calls.reset();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('RecurringTasks (Unauthenticated)', () => {
    let unauthService: ScheduleService;
    beforeEach(() => {
      TestBed.resetTestingModule();
      mockAuthService = jasmine.createSpyObj('AuthService', [], {
        currentUserSig: signal(null),
      });
      TestBed.configureTestingModule({
        providers: [
          ScheduleService,
          { provide: AuthService, useValue: mockAuthService },
          { provide: Firestore, useValue: firestoreMock },
        ],
      });
      unauthService = TestBed.inject(ScheduleService);
    });

    it('should handle getRecurringTasks returning empty', (done) => {
      unauthService.getRecurringTasks().subscribe((tasks) => {
        expect(tasks).toEqual([]);
        done();
      });
    });

    it('should fail createRecurringTask silently', async () => {
      await unauthService.createRecurringTask({
        title: 'Task',
        time: '12:00',
        color: '#fff',
        enabled: true,
      });
      expect(unauthService.loading()).toBeFalse();
    });

    it('should fail updateRecurringTask silently', async () => {
      await unauthService.updateRecurringTask('1', { title: 'New Task' });
      expect(unauthService.loading()).toBeFalse();
    });

    it('should fail deleteRecurringTask silently', async () => {
      await unauthService.deleteRecurringTask('1');
      expect(unauthService.loading()).toBeFalse();
    });
  });

  describe('RecurringTasks (Authenticated)', () => {
    it('should get recurring tasks', (done) => {
      const mockTasks = [{ id: '1', title: 'Task 1' }];
      safeSpy(firestore, 'collection').and.returnValue({} as any);
      safeSpy(firestore, 'orderBy').and.returnValue({} as any);
      safeSpy(firestore, 'query').and.returnValue({} as any);
      safeSpy(firestore, 'collectionData').and.returnValue(of(mockTasks));

      service.getRecurringTasks().subscribe((tasks) => {
        expect(tasks).toEqual(mockTasks as any);
        expect(firestore.collection).toHaveBeenCalled();
        done();
      });
    });

    it('should create recurring task', async () => {
      const addDocSpy = safeSpy(firestore, 'addDoc').and.returnValue(
        Promise.resolve({ id: 'new-id' }),
      );
      safeSpy(firestore, 'collection').and.returnValue({} as any);

      await service.createRecurringTask({
        title: 'Test',
        time: '10:00',
        color: '#000',
        enabled: true,
      });

      expect(addDocSpy).toHaveBeenCalled();
      expect(service.error()).toBeNull();
    });

    it('should handle createRecurringTask error', async () => {
      safeSpy(firestore, 'addDoc').and.returnValue(Promise.reject(new Error('Test Error')));
      safeSpy(firestore, 'collection').and.returnValue({} as any);

      await service.createRecurringTask({
        title: 'Test',
        time: '10:00',
        color: '#000',
        enabled: true,
      });

      expect(service.error()).toBe('Test Error');
    });

    it('should update recurring task', async () => {
      const updateDocSpy = safeSpy(firestore, 'updateDoc').and.returnValue(Promise.resolve());
      safeSpy(firestore, 'doc').and.returnValue({} as any);

      await service.updateRecurringTask('task-1', { title: 'Updated' });

      expect(updateDocSpy).toHaveBeenCalled();
      expect(service.error()).toBeNull();
    });

    it('should handle updateRecurringTask error', async () => {
      safeSpy(firestore, 'updateDoc').and.returnValue(Promise.reject(new Error('Update Error')));
      safeSpy(firestore, 'doc').and.returnValue({} as any);

      await service.updateRecurringTask('task-1', { title: 'Updated' });

      expect(service.error()).toBe('Update Error');
    });

    it('should delete recurring task', async () => {
      const deleteDocSpy = safeSpy(firestore, 'deleteDoc').and.returnValue(Promise.resolve());
      safeSpy(firestore, 'doc').and.returnValue({} as any);

      await service.deleteRecurringTask('task-1');

      expect(deleteDocSpy).toHaveBeenCalled();
      expect(service.error()).toBeNull();
    });

    it('should handle deleteRecurringTask error', async () => {
      safeSpy(firestore, 'deleteDoc').and.returnValue(Promise.reject(new Error('Delete Error')));
      safeSpy(firestore, 'doc').and.returnValue({} as any);

      await service.deleteRecurringTask('task-1');

      expect(service.error()).toBe('Delete Error');
    });
  });

  describe('WeeklyBlocks (Unauthenticated)', () => {
    let unauthService: ScheduleService;
    beforeEach(() => {
      TestBed.resetTestingModule();
      mockAuthService = jasmine.createSpyObj('AuthService', [], {
        currentUserSig: signal(null),
      });
      TestBed.configureTestingModule({
        providers: [
          ScheduleService,
          { provide: AuthService, useValue: mockAuthService },
          { provide: Firestore, useValue: firestoreMock },
        ],
      });
      unauthService = TestBed.inject(ScheduleService);
    });

    it('should handle getWeeklyBlocks returning empty', (done) => {
      unauthService.getWeeklyBlocks().subscribe((blocks) => {
        expect(blocks).toEqual([]);
        done();
      });
    });

    it('should fail createWeeklyBlock silently', async () => {
      await unauthService.createWeeklyBlock({
        title: 'Task',
        dayOfWeek: 1,
        startTime: '10:00',
        endTime: '11:00',
        color: '#fff',
        repeating: true,
      });
      expect(unauthService.loading()).toBeFalse();
    });

    it('should fail updateWeeklyBlock silently', async () => {
      await unauthService.updateWeeklyBlock('1', { title: 'New Task' });
      expect(unauthService.loading()).toBeFalse();
    });

    it('should fail deleteWeeklyBlock silently', async () => {
      await unauthService.deleteWeeklyBlock('1');
      expect(unauthService.loading()).toBeFalse();
    });
  });

  describe('WeeklyBlocks (Authenticated)', () => {
    it('should get weekly blocks', (done) => {
      const mockBlocks = [{ id: '1', title: 'Block 1' }];
      safeSpy(firestore, 'collection').and.returnValue({} as any);
      safeSpy(firestore, 'orderBy').and.returnValue({} as any);
      safeSpy(firestore, 'query').and.returnValue({} as any);
      safeSpy(firestore, 'collectionData').and.returnValue(of(mockBlocks));

      service.getWeeklyBlocks().subscribe((blocks) => {
        expect(blocks).toEqual(mockBlocks as any);
        expect(firestore.collection).toHaveBeenCalled();
        done();
      });
    });

    it('should create weekly block', async () => {
      const addDocSpy = safeSpy(firestore, 'addDoc').and.returnValue(
        Promise.resolve({ id: 'new-id' }),
      );
      safeSpy(firestore, 'collection').and.returnValue({} as any);

      await service.createWeeklyBlock({
        title: 'Test Block',
        dayOfWeek: 1,
        startTime: '10:00',
        endTime: '11:00',
        color: '#000',
        repeating: true,
      });

      expect(addDocSpy).toHaveBeenCalled();
      expect(service.error()).toBeNull();
    });

    it('should handle createWeeklyBlock error', async () => {
      safeSpy(firestore, 'addDoc').and.returnValue(Promise.reject(new Error('Test Error')));
      safeSpy(firestore, 'collection').and.returnValue({} as any);

      await service.createWeeklyBlock({
        title: 'Test Block',
        dayOfWeek: 1,
        startTime: '10:00',
        endTime: '11:00',
        color: '#000',
        repeating: true,
      });

      expect(service.error()).toBe('Test Error');
    });

    it('should update weekly block', async () => {
      const updateDocSpy = safeSpy(firestore, 'updateDoc').and.returnValue(Promise.resolve());
      safeSpy(firestore, 'doc').and.returnValue({} as any);

      await service.updateWeeklyBlock('block-1', { title: 'Updated' });

      expect(updateDocSpy).toHaveBeenCalled();
      expect(service.error()).toBeNull();
    });

    it('should handle updateWeeklyBlock error', async () => {
      safeSpy(firestore, 'updateDoc').and.returnValue(Promise.reject(new Error('Update Error')));
      safeSpy(firestore, 'doc').and.returnValue({} as any);

      await service.updateWeeklyBlock('block-1', { title: 'Updated' });

      expect(service.error()).toBe('Update Error');
    });

    it('should delete weekly block', async () => {
      const deleteDocSpy = safeSpy(firestore, 'deleteDoc').and.returnValue(Promise.resolve());
      safeSpy(firestore, 'doc').and.returnValue({} as any);

      await service.deleteWeeklyBlock('block-1');

      expect(deleteDocSpy).toHaveBeenCalled();
      expect(service.error()).toBeNull();
    });

    it('should handle deleteWeeklyBlock error', async () => {
      safeSpy(firestore, 'deleteDoc').and.returnValue(Promise.reject(new Error('Delete Error')));
      safeSpy(firestore, 'doc').and.returnValue({} as any);

      await service.deleteWeeklyBlock('block-1');

      expect(service.error()).toBe('Delete Error');
    });
  });
});

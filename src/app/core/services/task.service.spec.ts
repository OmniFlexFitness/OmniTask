import { TestBed } from '@angular/core/testing';
import { TaskService } from './task.service';
import * as firestore from '@angular/fire/firestore';
import { Firestore } from '@angular/fire/firestore';
import { AuthService } from '../auth/auth.service';
import { GoogleTasksService } from './google-tasks.service';
import { GoogleTasksSyncService } from './google-tasks-sync.service';
import { ProjectService } from './project.service';
import { signal } from '@angular/core';
import { of } from 'rxjs';

/**
 * Unit tests for TaskService

 * Tests core task CRUD operations and reordering logic
 */
describe('TaskService', () => {
  let service: TaskService;

  const firestoreMock = {} as unknown as Firestore;
  Object.setPrototypeOf(firestoreMock, Firestore.prototype);

  const authServiceMock = {
    currentUserSig: signal({ uid: 'test-user-123', email: 'test@example.com' }),
    googleTasksAccessToken: signal('mock-token'),
  };

  const googleTasksServiceMock = {
    createTask: () => of({ id: 'google-task-1' }),
    updateTask: () => of({}),
    deleteTask: () => of(void 0),
    isAuthenticated: signal(true),
  };

  const googleTasksSyncServiceMock = {
    transformToGoogleTask: () => ({}),
    deleteTaskInGoogle: () => Promise.resolve(),
  };

  const projectServiceMock = {
    getProject: (id: string): Promise<any> => Promise.resolve(null),
    addMember: (projectId: string, userId: string): Promise<void> => Promise.resolve(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TaskService,
        { provide: Firestore, useValue: firestoreMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: GoogleTasksService, useValue: googleTasksServiceMock },
        { provide: GoogleTasksSyncService, useValue: googleTasksSyncServiceMock },
        { provide: ProjectService, useValue: projectServiceMock },
      ],
    });

    service = TestBed.inject(TaskService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('loading state', () => {
    it('should initialize with loading = false', () => {
      expect(service.loading()).toBe(false);
    });

    it('should initialize with error = null', () => {
      expect(service.error()).toBeNull();
    });
  });

  describe('reorderTasks', () => {
    it('should be defined and callable', () => {
      expect(service.reorderTasks).toBeDefined();
      expect(typeof service.reorderTasks).toBe('function');
    });

    it('should accept an array of tasks with order and sectionId', () => {
      // Verify the method accepts the expected parameter shape
      const tasks = [
        { id: 'task-1', order: 0, sectionId: 'section-1' },
        { id: 'task-2', order: 1, sectionId: 'section-1' },
        { id: 'task-3', order: 2, sectionId: 'section-1' },
      ];

      // Method should not throw for valid input shape
      // Note: Actual Firestore operations will fail without emulator
      expect(() => service.reorderTasks(tasks)).not.toThrow();
    });
  });

  describe('task status methods', () => {
    it('should have completeTask method', () => {
      expect(service.completeTask).toBeDefined();
      expect(typeof service.completeTask).toBe('function');
    });

    it('should have reopenTask method', () => {
      expect(service.reopenTask).toBeDefined();
      expect(typeof service.reopenTask).toBe('function');
    });
  });

  describe('sectionNameToStatus', () => {
    it('should map "Done" section to done status', () => {
      expect(service.sectionNameToStatus('Done')).toBe('done');
      expect(service.sectionNameToStatus('Complete')).toBe('done');
      expect(service.sectionNameToStatus('Completed Tasks')).toBe('done');
    });

    it('should map "In Progress" section to in-progress status', () => {
      expect(service.sectionNameToStatus('In Progress')).toBe('in-progress');
      expect(service.sectionNameToStatus('Doing')).toBe('in-progress');
      expect(service.sectionNameToStatus('WIP')).toBe('in-progress');
    });

    it('should map "To Do" section to todo status', () => {
      expect(service.sectionNameToStatus('To Do')).toBe('todo');
      expect(service.sectionNameToStatus('Todo')).toBe('todo');
      expect(service.sectionNameToStatus('Backlog')).toBe('todo');
    });

    it('should return null for unknown sections', () => {
      expect(service.sectionNameToStatus('Random Section')).toBeNull();
    });
  });

  describe('statusToSectionId', () => {
    const mockSections = [
      { id: 'section-1', name: 'To Do', order: 0, status: 'todo' as const },
      { id: 'section-2', name: 'In Progress', order: 1, status: 'in-progress' as const },
      { id: 'section-3', name: 'Done', order: 2, status: 'done' as const },
    ];

    it('should find the Done section for done status', () => {
      expect(service.statusToSectionId('done', mockSections)).toBe('section-3');
    });

    it('should find the In Progress section for in-progress status', () => {
      expect(service.statusToSectionId('in-progress', mockSections)).toBe('section-2');
    });

    it('should find the To Do section for todo status', () => {
      expect(service.statusToSectionId('todo', mockSections)).toBe('section-1');
    });

    it('should return undefined when no matching section exists', () => {
      const sectionsWithoutDone = [
        { id: 'section-1', name: 'To Do', order: 0, status: 'todo' as const },
        { id: 'section-2', name: 'In Progress', order: 1, status: 'in-progress' as const },
      ];
      expect(service.statusToSectionId('done', sectionsWithoutDone)).toBeUndefined();
    });

    it('should return undefined for empty sections array', () => {
      expect(service.statusToSectionId('done', [])).toBeUndefined();
    });

    it('should fall back to name-based matching for legacy sections without status field', () => {
      const legacySections = [
        { id: 'section-1', name: 'To Do', order: 0 },
        { id: 'section-2', name: 'In Progress', order: 1 },
        { id: 'section-3', name: 'Done', order: 2 },
      ];
      expect(service.statusToSectionId('done', legacySections)).toBe('section-3');
      expect(service.statusToSectionId('in-progress', legacySections)).toBe('section-2');
      expect(service.statusToSectionId('todo', legacySections)).toBe('section-1');
    });
  });

  describe('getSectionStatus', () => {
    it('should return status from section.status field when present', () => {
      expect(service.getSectionStatus({ name: 'Custom Name', status: 'done' })).toBe('done');
      expect(service.getSectionStatus({ name: 'Whatever', status: 'todo' })).toBe('todo');
    });

    it('should fall back to name-based matching when status field is absent', () => {
      expect(service.getSectionStatus({ name: 'Done' })).toBe('done');
      expect(service.getSectionStatus({ name: 'In Progress' })).toBe('in-progress');
      expect(service.getSectionStatus({ name: 'To Do' })).toBe('todo');
    });

    it('should return null for unknown sections without status field', () => {
      expect(service.getSectionStatus({ name: 'Random Section' })).toBeNull();
    });

    it('should prefer status field over name-based matching', () => {
      // Section named "Done" but status is actually "todo"
      expect(service.getSectionStatus({ name: 'Done', status: 'todo' })).toBe('todo');
    });
  });

  describe('findSectionForStatus', () => {
    it('should find section by status field', () => {
      const sections = [
        { id: 's1', name: 'Custom', order: 0, status: 'todo' as const },
        { id: 's2', name: 'Working', order: 1, status: 'in-progress' as const },
        { id: 's3', name: 'Finished', order: 2, status: 'done' as const },
      ];
      expect(service.findSectionForStatus('done', sections)?.id).toBe('s3');
      expect(service.findSectionForStatus('todo', sections)?.id).toBe('s1');
    });

    it('should fall back to name-based matching for legacy sections', () => {
      const legacySections = [
        { id: 's1', name: 'To Do', order: 0 },
        { id: 's2', name: 'Done', order: 1 },
      ];
      expect(service.findSectionForStatus('done', legacySections)?.id).toBe('s2');
      expect(service.findSectionForStatus('todo', legacySections)?.id).toBe('s1');
    });

    it('should return undefined when no match found', () => {
      const sections = [
        { id: 's1', name: 'Alpha', order: 0 },
        { id: 's2', name: 'Beta', order: 1 },
      ];
      expect(service.findSectionForStatus('done', sections)).toBeUndefined();
    });
  });

  describe('CRUD operations', () => {
    let addDocSpy: jasmine.Spy;
    let updateDocSpy: jasmine.Spy;
    let deleteDocSpy: jasmine.Spy;
    let getDocSpy: jasmine.Spy;
    let docSpy: jasmine.Spy;

    beforeEach(() => {
      const safeSpy = (obj: any, method: string) =>
        obj[method].and ? obj[method] : spyOn(obj, method);
      addDocSpy = safeSpy(firestore, 'addDoc').and.returnValue(
        Promise.resolve({ id: 'new-task-1' } as any),
      );
      updateDocSpy = safeSpy(firestore, 'updateDoc').and.returnValue(Promise.resolve());
      deleteDocSpy = safeSpy(firestore, 'deleteDoc').and.returnValue(Promise.resolve());
      getDocSpy = safeSpy(firestore, 'getDoc').and.returnValue(
        Promise.resolve({
          exists: () => true,
          id: 'task-1',
          data: () => ({ projectId: 'proj-1', status: 'todo' }),
        } as any),
      );
      docSpy = safeSpy(firestore, 'doc').and.returnValue({} as any);
      safeSpy(firestore, 'collection').and.returnValue({} as any);
      safeSpy(firestore, 'query').and.returnValue({} as any);
      safeSpy(firestore, 'where').and.returnValue({} as any);
      safeSpy(firestore, 'collectionData').and.returnValue(of([]));

      addDocSpy.calls?.reset();
      updateDocSpy.calls?.reset();
      deleteDocSpy.calls?.reset();
      getDocSpy.calls?.reset();
      docSpy.calls?.reset();

      projectServiceMock.getProject = jasmine
        .createSpy()
        .and.returnValue(
          Promise.resolve({ sections: [{ id: 's1', name: 'To Do', status: 'todo' }] }),
        );
      projectServiceMock.addMember = jasmine.createSpy().and.returnValue(Promise.resolve());
    });

    it('should create a task and return a document reference', async () => {
      const taskData = {
        projectId: 'proj-1',
        title: 'New Task',
        status: 'todo' as const,
        description: '',
        priority: 'medium' as const,
        order: 0,
        tags: [],
        subtasks: [],
        parentTaskId: null,
        createdById: 'test-user-123',
        assigneeIds: [],
      };
      const res = await service.createTask(taskData);
      expect(addDocSpy).toHaveBeenCalled();
      expect(res.id).toBe('new-task-1');
      expect(service.loading()).toBeFalse();
    });

    it('should create a task and sync to google tasks if list id is provided', async () => {
      spyOn(googleTasksServiceMock, 'createTask').and.callThrough();
      const taskData = {
        projectId: 'proj-1',
        title: 'New Task',
        status: 'todo' as const,
        description: '',
        priority: 'medium' as const,
        order: 0,
        tags: [],
        subtasks: [],
        parentTaskId: null,
        createdById: 'test-user-123',
        assigneeIds: [],
      };
      await service.createTask(taskData, 'list-1');
      expect(addDocSpy).toHaveBeenCalled();
      expect(googleTasksServiceMock.createTask).toHaveBeenCalled();
      expect(updateDocSpy).toHaveBeenCalled(); // updating doc with google task id
    });

    it('should update a task', async () => {
      await service.updateTask('task-1', { title: 'Updated Task' });
      expect(getDocSpy).toHaveBeenCalled();
      expect(updateDocSpy).toHaveBeenCalled();
    });

    it('should sync to google tasks when updating a task linked to it', async () => {
      getDocSpy.and.returnValue(
        Promise.resolve({
          exists: () => true,
          id: 'task-1',
          data: () => ({
            projectId: 'proj-1',
            status: 'todo',
            googleTaskId: 'g-task-1',
            googleTaskListId: 'list-1',
          }),
        } as any),
      );
      projectServiceMock.getProject = jasmine
        .createSpy()
        .and.returnValue(Promise.resolve({ googleTaskListId: 'list-1', sections: [] }));
      spyOn(googleTasksServiceMock, 'updateTask').and.callThrough();

      await service.updateTask('task-1', { title: 'Updated' });
      expect(googleTasksServiceMock.updateTask).toHaveBeenCalled();
    });

    it('should delete a task', async () => {
      await service.deleteTask('task-1');
      expect(getDocSpy).toHaveBeenCalled();
      expect(deleteDocSpy).toHaveBeenCalled();
    });

    it('should delete from google tasks if linked', async () => {
      getDocSpy.and.returnValue(
        Promise.resolve({
          exists: () => true,
          id: 'task-1',
          data: () => ({
            projectId: 'proj-1',
            status: 'todo',
            googleTaskId: 'g-task-1',
            googleTaskListId: 'list-1',
          }),
        } as any),
      );
      spyOn(googleTasksSyncServiceMock, 'deleteTaskInGoogle').and.callThrough();

      await service.deleteTask('task-1');
      expect(googleTasksSyncServiceMock.deleteTaskInGoogle).toHaveBeenCalled();
      expect(deleteDocSpy).toHaveBeenCalled();
    });

    it('should auto-add assigned user to project when creating', async () => {
      await service.createTask({
        projectId: 'proj-1',
        title: 'Task',
        assignedToId: 'user-xyz',
        status: 'todo' as const,
        description: '',
        priority: 'medium' as const,
        order: 0,
        tags: [],
        subtasks: [],
        createdById: 'test-user-123',
        assigneeIds: [],
      });
      expect(projectServiceMock.addMember).toHaveBeenCalledWith('proj-1', 'user-xyz');
    });
  });

  describe('query methods', () => {
    let collectionDataSpy: jasmine.Spy;
    let querySpy: jasmine.Spy;

    beforeEach(() => {
      const safeSpy = (obj: any, method: string) =>
        obj[method].and ? obj[method] : spyOn(obj, method);
      collectionDataSpy = safeSpy(firestore, 'collectionData').and.returnValue([] as any);
      querySpy = safeSpy(firestore, 'query').and.returnValue({} as any);
      safeSpy(firestore, 'collection').and.returnValue({} as any);
      safeSpy(firestore, 'where').and.returnValue({} as any);
      safeSpy(firestore, 'orderBy').and.returnValue({} as any);
      collectionDataSpy.calls?.reset();
      querySpy.calls?.reset();
    });

    it('should query tasks by project', () => {
      service.getTasksByProject('proj-1');
      expect(querySpy).toHaveBeenCalled();
      expect(collectionDataSpy).toHaveBeenCalled();
    });

    it('should query tasks by section', () => {
      service.getTasksBySection('proj-1', 'sec-1');
      expect(querySpy).toHaveBeenCalled();
      expect(collectionDataSpy).toHaveBeenCalled();
    });

    it('should query tasks by status', () => {
      service.getTasksByStatus('proj-1', 'todo');
      expect(querySpy).toHaveBeenCalled();
      expect(collectionDataSpy).toHaveBeenCalled();
    });

    it('should query tasks by date range', () => {
      service.getTasksByDateRange('proj-1', new Date(), new Date());
      expect(querySpy).toHaveBeenCalled();
      expect(collectionDataSpy).toHaveBeenCalled();
    });

    it('should get a single task by ID', async () => {
      const getDocSpy = (firestore.getDoc as any).and
        ? (firestore.getDoc as any)
        : spyOn(firestore, 'getDoc');
      getDocSpy.and.returnValue(
        Promise.resolve({
          exists: () => true,
          id: 'task-1',
          data: () => ({ title: 'Test' }),
        } as any),
      );
      const docSpyLocal = (firestore.doc as any).and
        ? (firestore.doc as any)
        : spyOn(firestore, 'doc');
      docSpyLocal.and.returnValue({} as any);

      const res = await service.getTask('task-1');
      expect(getDocSpy).toHaveBeenCalled();
      expect(res?.title).toBe('Test');
    });
  });

  describe('bulk operations', () => {
    let writeBatchSpy: jasmine.Spy;
    let commitSpy: jasmine.Spy;
    let updateSpy: jasmine.Spy;
    let deleteSpy: jasmine.Spy;

    beforeEach(() => {
      commitSpy = jasmine.createSpy().and.returnValue(Promise.resolve());
      updateSpy = jasmine.createSpy();
      deleteSpy = jasmine.createSpy();
      const safeSpy = (obj: any, method: string) =>
        obj[method].and ? obj[method] : spyOn(obj, method);
      writeBatchSpy = safeSpy(firestore, 'writeBatch').and.returnValue({
        commit: commitSpy,
        update: updateSpy,
        delete: deleteSpy,
      } as any);
      safeSpy(firestore, 'doc').and.returnValue({} as any);
      writeBatchSpy.calls?.reset();
    });

    it('should bulk update tasks', async () => {
      await service.bulkUpdateTasks(['task-1', 'task-2'], { title: 'Updated' });
      expect(writeBatchSpy).toHaveBeenCalled();
      expect(updateSpy).toHaveBeenCalledTimes(2);
      expect(commitSpy).toHaveBeenCalled();
    });

    it('should bulk delete tasks', async () => {
      await service.bulkDeleteTasks(['task-1', 'task-2']);
      expect(writeBatchSpy).toHaveBeenCalled();
      expect(deleteSpy).toHaveBeenCalledTimes(2);
      expect(commitSpy).toHaveBeenCalled();
    });

    it('should reorder tasks', async () => {
      spyOn(service, 'getTask').and.returnValue(Promise.resolve(null));
      await service.reorderTasks([
        { id: 'task-1', order: 1 },
        { id: 'task-2', order: 2 },
      ]);
      expect(writeBatchSpy).toHaveBeenCalled();
      expect(updateSpy).toHaveBeenCalledTimes(2);
      expect(commitSpy).toHaveBeenCalled();
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { TaskService } from './task.service';
import { Firestore } from '@angular/fire/firestore';
import { AuthService } from '../auth/auth.service';
import { GoogleTasksService } from './google-tasks.service';
import { GoogleTasksSyncService } from './google-tasks-sync.service';
import { ProjectService } from './project.service';
import { signal } from '@angular/core';

/**
 * Unit tests for TaskService
 * Tests core task CRUD operations and reordering logic
 */
describe('TaskService', () => {
  let service: TaskService;

  // Mock implementations
  const firestoreMock = {
    collection: () => ({}),
    doc: () => ({}),
  };

  const authServiceMock = {
    currentUserSig: signal({ uid: 'test-user-123', email: 'test@example.com' }),
    googleTasksAccessToken: signal('mock-token'),
  };

  const googleTasksServiceMock = {
    createTask: () => Promise.resolve({ id: 'google-task-1' }),
    updateTask: () => Promise.resolve({}),
    deleteTask: () => Promise.resolve(),
    isAuthenticated: signal(true),
  };

  const googleTasksSyncServiceMock = {
    transformToGoogleTask: () => ({}),
    deleteTaskInGoogle: () => Promise.resolve(),
  };

  const projectServiceMock = {
    getProject: () => Promise.resolve(null),
    addMember: () => Promise.resolve(),
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

  describe('bulk operations', () => {
    it('should have bulkUpdateTasks method', () => {
      expect(service.bulkUpdateTasks).toBeDefined();
      expect(typeof service.bulkUpdateTasks).toBe('function');
    });

    it('should have bulkDeleteTasks method', () => {
      expect(service.bulkDeleteTasks).toBeDefined();
      expect(typeof service.bulkDeleteTasks).toBe('function');
    });
  });

  describe('query methods', () => {
    it('should have getTasksByProject method', () => {
      expect(service.getTasksByProject).toBeDefined();
    });

    it('should have getTasksBySection method', () => {
      expect(service.getTasksBySection).toBeDefined();
    });

    it('should have getTasksByStatus method', () => {
      expect(service.getTasksByStatus).toBeDefined();
    });

    it('should have getTasksByDateRange method', () => {
      expect(service.getTasksByDateRange).toBeDefined();
    });

    it('should have getTask method for single task lookup', () => {
      expect(service.getTask).toBeDefined();
    });
  });

  describe('CRUD operations', () => {
    it('should have createTask method', () => {
      expect(service.createTask).toBeDefined();
    });

    it('should have updateTask method', () => {
      expect(service.updateTask).toBeDefined();
    });

    it('should have deleteTask method', () => {
      expect(service.deleteTask).toBeDefined();
    });
  });
});

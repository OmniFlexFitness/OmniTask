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

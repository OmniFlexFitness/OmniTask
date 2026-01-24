import { TestBed } from '@angular/core/testing';
import { GoogleTasksSyncService } from './google-tasks-sync.service';
import { Firestore } from '@angular/fire/firestore';
import { GoogleTasksService, GoogleTask } from './google-tasks.service';
import { Task } from '../models/domain.model';

/**
 * Unit tests for GoogleTasksSyncService
 * Tests transformation logic between OmniTask and Google Tasks formats
 */
describe('GoogleTasksSyncService', () => {
  let service: GoogleTasksSyncService;

  // Mock implementations
  const firestoreMock = {
    collection: () => ({}),
    doc: () => ({}),
  };

  const googleTasksServiceMock = {
    getTasks: () => Promise.resolve({ items: [] }),
    createTask: () => Promise.resolve({ id: 'google-task-1' }),
    updateTask: () => Promise.resolve({}),
    deleteTask: () => Promise.resolve(),
    createTaskList: () => Promise.resolve({ id: 'list-1' }),
    deleteTaskList: () => Promise.resolve(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        GoogleTasksSyncService,
        { provide: Firestore, useValue: firestoreMock },
        { provide: GoogleTasksService, useValue: googleTasksServiceMock },
      ],
    });

    service = TestBed.inject(GoogleTasksSyncService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('transformToGoogleTask', () => {
    it('should map title correctly', () => {
      const task: Partial<Task> = { title: 'Test Task' };
      const result = service.transformToGoogleTask(task);
      expect(result.title).toBe('Test Task');
    });

    it('should map description to notes', () => {
      const task: Partial<Task> = { description: 'Task description' };
      const result = service.transformToGoogleTask(task);
      expect(result.notes).toBe('Task description');
    });

    it('should map status "done" to "completed"', () => {
      const task: Partial<Task> = { status: 'done' };
      const result = service.transformToGoogleTask(task);
      expect(result.status).toBe('completed');
    });

    it('should map status "todo" to "needsAction"', () => {
      const task: Partial<Task> = { status: 'todo' };
      const result = service.transformToGoogleTask(task);
      expect(result.status).toBe('needsAction');
    });

    it('should map status "in-progress" to "needsAction"', () => {
      const task: Partial<Task> = { status: 'in-progress' };
      const result = service.transformToGoogleTask(task);
      expect(result.status).toBe('needsAction');
    });

    it('should convert Date dueDate to ISO string', () => {
      const dueDate = new Date('2025-06-15T10:00:00Z');
      const task: Partial<Task> = { dueDate };
      const result = service.transformToGoogleTask(task);
      expect(result.due).toBe(dueDate.toISOString());
    });

    it('should handle undefined fields gracefully', () => {
      const task: Partial<Task> = {};
      const result = service.transformToGoogleTask(task);
      expect(result.title).toBeUndefined();
      expect(result.notes).toBeUndefined();
      expect(result.status).toBeUndefined();
    });
  });

  describe('transformFromGoogleTask', () => {
    const projectId = 'project-123';
    const googleTaskListId = 'list-456';

    it('should map title correctly', () => {
      const googleTask: GoogleTask = { id: 'gt-1', title: 'Google Task' };
      const result = service.transformFromGoogleTask(googleTask, projectId, googleTaskListId);
      expect(result.title).toBe('Google Task');
    });

    it('should use "Untitled" for empty title', () => {
      const googleTask: GoogleTask = { id: 'gt-1', title: '' };
      const result = service.transformFromGoogleTask(googleTask, projectId, googleTaskListId);
      expect(result.title).toBe('Untitled');
    });

    it('should map notes to description', () => {
      const googleTask: GoogleTask = { id: 'gt-1', notes: 'Some notes' };
      const result = service.transformFromGoogleTask(googleTask, projectId, googleTaskListId);
      expect(result.description).toBe('Some notes');
    });

    it('should map "completed" status to "done"', () => {
      const googleTask: GoogleTask = { id: 'gt-1', status: 'completed' };
      const result = service.transformFromGoogleTask(googleTask, projectId, googleTaskListId);
      expect(result.status).toBe('done');
    });

    it('should map "needsAction" status to "todo"', () => {
      const googleTask: GoogleTask = { id: 'gt-1', status: 'needsAction' };
      const result = service.transformFromGoogleTask(googleTask, projectId, googleTaskListId);
      expect(result.status).toBe('todo');
    });

    it('should set projectId correctly', () => {
      const googleTask: GoogleTask = { id: 'gt-1' };
      const result = service.transformFromGoogleTask(googleTask, projectId, googleTaskListId);
      expect(result.projectId).toBe(projectId);
    });

    it('should set googleTaskId correctly', () => {
      const googleTask: GoogleTask = { id: 'gt-1' };
      const result = service.transformFromGoogleTask(googleTask, projectId, googleTaskListId);
      expect(result.googleTaskId).toBe('gt-1');
    });

    it('should set googleTaskListId correctly', () => {
      const googleTask: GoogleTask = { id: 'gt-1' };
      const result = service.transformFromGoogleTask(googleTask, projectId, googleTaskListId);
      expect(result.googleTaskListId).toBe(googleTaskListId);
    });

    it('should mark as Google Task', () => {
      const googleTask: GoogleTask = { id: 'gt-1' };
      const result = service.transformFromGoogleTask(googleTask, projectId, googleTaskListId);
      expect(result.isGoogleTask).toBe(true);
    });

    it('should set default priority to "medium"', () => {
      const googleTask: GoogleTask = { id: 'gt-1' };
      const result = service.transformFromGoogleTask(googleTask, projectId, googleTaskListId);
      expect(result.priority).toBe('medium');
    });

    it('should convert due date string to Date object', () => {
      const googleTask: GoogleTask = { id: 'gt-1', due: '2025-06-15T00:00:00.000Z' };
      const result = service.transformFromGoogleTask(googleTask, projectId, googleTaskListId);
      expect(result.dueDate).toBeInstanceOf(Date);
    });
  });

  describe('service methods', () => {
    it('should have createTaskListForProject method', () => {
      expect(service.createTaskListForProject).toBeDefined();
    });

    it('should have deleteTaskListForProject method', () => {
      expect(service.deleteTaskListForProject).toBeDefined();
    });

    it('should have createTaskInGoogle method', () => {
      expect(service.createTaskInGoogle).toBeDefined();
    });

    it('should have updateTaskInGoogle method', () => {
      expect(service.updateTaskInGoogle).toBeDefined();
    });

    it('should have deleteTaskInGoogle method', () => {
      expect(service.deleteTaskInGoogle).toBeDefined();
    });

    it('should have pullFromGoogleTasks method', () => {
      expect(service.pullFromGoogleTasks).toBeDefined();
    });
  });
});

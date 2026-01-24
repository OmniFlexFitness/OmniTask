import { TestBed } from '@angular/core/testing';
import { ProjectService } from './project.service';
import { Firestore } from '@angular/fire/firestore';
import { AuthService } from '../auth/auth.service';
import { GoogleTasksSyncService } from './google-tasks-sync.service';
import { signal } from '@angular/core';

/**
 * Unit tests for ProjectService
 * Tests core project CRUD operations and member management
 */
describe('ProjectService', () => {
  let service: ProjectService;

  // Mock implementations
  const firestoreMock = {
    collection: () => ({}),
    doc: () => ({}),
  };

  const authServiceMock = {
    currentUserSig: signal({
      uid: 'test-user-123',
      email: 'test@example.com',
      displayName: 'Test User',
    }),
    googleTasksAccessToken: signal('mock-token'),
    user$: { pipe: () => ({ subscribe: () => {} }) },
  };

  const googleTasksSyncServiceMock = {
    createTaskListForProject: () => Promise.resolve('list-id'),
    deleteTaskListForProject: () => Promise.resolve(),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ProjectService,
        { provide: Firestore, useValue: firestoreMock },
        { provide: AuthService, useValue: authServiceMock },
        { provide: GoogleTasksSyncService, useValue: googleTasksSyncServiceMock },
      ],
    });

    service = TestBed.inject(ProjectService);
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

    it('should have selectedProjectId signal', () => {
      expect(service.selectedProjectId).toBeDefined();
      expect(service.selectedProjectId()).toBeNull();
    });
  });

  describe('CRUD methods', () => {
    it('should have createProject method', () => {
      expect(service.createProject).toBeDefined();
      expect(typeof service.createProject).toBe('function');
    });

    it('should have updateProject method', () => {
      expect(service.updateProject).toBeDefined();
      expect(typeof service.updateProject).toBe('function');
    });

    it('should have deleteProject method', () => {
      expect(service.deleteProject).toBeDefined();
      expect(typeof service.deleteProject).toBe('function');
    });

    it('should have getProject method', () => {
      expect(service.getProject).toBeDefined();
      expect(typeof service.getProject).toBe('function');
    });

    it('should have getProject$ observable method', () => {
      expect(service.getProject$).toBeDefined();
      expect(typeof service.getProject$).toBe('function');
    });
  });

  describe('query methods', () => {
    it('should have getMyProjects method', () => {
      expect(service.getMyProjects).toBeDefined();
    });

    it('should have getAllTags method', () => {
      expect(service.getAllTags).toBeDefined();
    });
  });

  describe('archive operations', () => {
    it('should have archiveProject method', () => {
      expect(service.archiveProject).toBeDefined();
      expect(typeof service.archiveProject).toBe('function');
    });

    it('should have restoreProject method', () => {
      expect(service.restoreProject).toBeDefined();
      expect(typeof service.restoreProject).toBe('function');
    });
  });

  describe('member management', () => {
    it('should have addMember method', () => {
      expect(service.addMember).toBeDefined();
      expect(typeof service.addMember).toBe('function');
    });

    it('should have removeMember method', () => {
      expect(service.removeMember).toBeDefined();
      expect(typeof service.removeMember).toBe('function');
    });
  });

  describe('section management', () => {
    it('should have addSection method', () => {
      expect(service.addSection).toBeDefined();
      expect(typeof service.addSection).toBe('function');
    });

    it('should have updateSection method', () => {
      expect(service.updateSection).toBeDefined();
      expect(typeof service.updateSection).toBe('function');
    });

    it('should have reorderSections method', () => {
      expect(service.reorderSections).toBeDefined();
      expect(typeof service.reorderSections).toBe('function');
    });
  });

  describe('tag management', () => {
    it('should have addTag method', () => {
      expect(service.addTag).toBeDefined();
      expect(typeof service.addTag).toBe('function');
    });
  });

  describe('custom field management', () => {
    it('should have addCustomField method', () => {
      expect(service.addCustomField).toBeDefined();
      expect(typeof service.addCustomField).toBe('function');
    });

    it('should have updateCustomField method', () => {
      expect(service.updateCustomField).toBeDefined();
      expect(typeof service.updateCustomField).toBe('function');
    });
  });
});

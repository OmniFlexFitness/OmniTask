import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ProjectGoogleTasksSyncComponent } from './project-google-tasks-sync.component';
import { ProjectService } from '../../../core/services/project.service';
import { DialogService } from '../../../core/services/dialog.service';
import { AuthService } from '../../../core/auth/auth.service';
import { GoogleTasksService } from '../../../core/services/google-tasks.service';
import { GoogleTasksSyncService } from '../../../core/services/google-tasks-sync.service';
import { ComponentRef, signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { Project } from '../../../core/models/domain.model';
import { Timestamp } from '@angular/fire/firestore';

describe('ProjectGoogleTasksSyncComponent', () => {
  let component: ProjectGoogleTasksSyncComponent;
  let componentRef: ComponentRef<ProjectGoogleTasksSyncComponent>;
  let fixture: ComponentFixture<ProjectGoogleTasksSyncComponent>;

  let mockProjectService: jasmine.SpyObj<ProjectService>;
  let mockDialogService: jasmine.SpyObj<DialogService>;
  let mockGoogleTasksService: jasmine.SpyObj<GoogleTasksService>;
  let mockGoogleTasksSyncService: jasmine.SpyObj<GoogleTasksSyncService>;
  let mockAuthService: jasmine.SpyObj<AuthService>;

  const mockProject: Project = {
    id: 'proj1',
    name: 'Test Project',
    description: '',
    color: '#fff',
    icon: 'star',
    ownerId: 'user1',
    memberIds: [],
    sections: [],
    status: 'active',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    googleTaskListId: 'list1',
    syncEnabled: true,
    syncStatus: 'synced',
    lastSyncAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    mockProjectService = jasmine.createSpyObj('ProjectService', ['updateProject']);
    mockProjectService.updateProject.and.returnValue(Promise.resolve());

    mockDialogService = jasmine.createSpyObj('DialogService', ['alert', 'confirm']);
    mockDialogService.confirm.and.returnValue(Promise.resolve(true));
    mockDialogService.alert.and.returnValue(Promise.resolve());

    mockGoogleTasksService = jasmine.createSpyObj('GoogleTasksService', [
      'getTaskLists',
      'getTasks',
      'isAuthenticated',
    ]);
    mockGoogleTasksService.isAuthenticated.and.returnValue(true);
    mockGoogleTasksService.getTaskLists.and.returnValue(
      of({ items: [{ id: 'list1', title: 'Test List' }] }),
    );
    mockGoogleTasksService.getTasks.and.returnValue(of({ items: [{ id: 't1', title: 'Task 1' }] }));

    mockGoogleTasksSyncService = jasmine.createSpyObj('GoogleTasksSyncService', [
      'pullFromGoogleTasks',
    ]);
    mockGoogleTasksSyncService.pullFromGoogleTasks.and.returnValue(
      Promise.resolve({ added: 1, updated: 0, pushed: 0 }),
    );

    mockAuthService = jasmine.createSpyObj('AuthService', [
      'logout',
      'requestOfflineAccess',
      'hasOfflineAccess',
    ]);
    mockAuthService.hasOfflineAccess.and.returnValue(false);
    mockAuthService.requestOfflineAccess.and.returnValue(Promise.resolve(true));
    mockAuthService.logout.and.returnValue(Promise.resolve());

    await TestBed.configureTestingModule({
      imports: [ProjectGoogleTasksSyncComponent],
      providers: [
        { provide: ProjectService, useValue: mockProjectService },
        { provide: DialogService, useValue: mockDialogService },
        { provide: GoogleTasksService, useValue: mockGoogleTasksService },
        { provide: GoogleTasksSyncService, useValue: mockGoogleTasksSyncService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectGoogleTasksSyncComponent);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;

    // Provide the required input
    componentRef.setInput('project', mockProject);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(component.currentLinkedListName()).toBe('Test List');
  });

  it('should initialize task lists if authenticated', async () => {
    expect(mockGoogleTasksService.getTaskLists).toHaveBeenCalled();
    expect(component.googleTaskLists().length).toBe(1);
  });

  describe('toggleSyncEnabled', () => {
    it('should disable sync', async () => {
      await component.toggleSyncEnabled();
      expect(mockProjectService.updateProject).toHaveBeenCalledWith('proj1', {
        syncEnabled: false,
        syncStatus: null as any,
        googleTaskListId: null as any,
      });
    });

    it('should enable sync', async () => {
      componentRef.setInput('project', { ...mockProject, syncEnabled: false });
      await component.toggleSyncEnabled();
      expect(mockProjectService.updateProject).toHaveBeenCalledWith('proj1', {
        syncEnabled: true,
        syncStatus: 'pending',
      });
    });
  });

  describe('selectTaskList', () => {
    it('should select list and close selector', async () => {
      component.showListSelector.set(true);
      await component.selectTaskList('newList');

      expect(mockProjectService.updateProject).toHaveBeenCalledWith('proj1', {
        googleTaskListId: 'newList',
        syncEnabled: true,
        syncStatus: 'pending',
      });
      expect(component.showListSelector()).toBeFalse();
    });
  });

  describe('previewList', () => {
    it('should fetch and set preview tasks', async () => {
      await component.previewList('list2', 'Another List');

      expect(component.previewingListId()).toBe('list2');
      expect(component.previewingListName()).toBe('Another List');
      expect(component.previewTasks().length).toBe(1);
      expect(mockGoogleTasksService.getTasks).toHaveBeenCalledWith('list2');
    });

    it('should close preview if clicking the same list', async () => {
      component.previewingListId.set('list2');
      await component.previewList('list2', 'Another List');

      expect(component.previewingListId()).toBeNull();
      expect(component.previewTasks()).toEqual([]);
    });

    it('should handle preview errors gracefully', async () => {
      spyOn(console, 'error');
      mockGoogleTasksService.getTasks.and.returnValue(throwError(() => 'HTTP Error'));
      await component.previewList('list3', 'Fail List');

      expect(component.previewTasks()).toEqual([]);
      expect(component.loadingPreview()).toBeFalse();
    });
  });

  describe('onTaskListChange', () => {
    it('should update list ID if valid', async () => {
      const event = { target: { value: 'selectedListId' } } as unknown as Event;
      await component.onTaskListChange(event);

      expect(mockProjectService.updateProject).toHaveBeenCalledWith('proj1', {
        googleTaskListId: 'selectedListId',
        syncStatus: 'pending',
      });
    });

    it('should clear list ID if empty', async () => {
      const event = { target: { value: '' } } as unknown as Event;
      await component.onTaskListChange(event);

      expect(mockProjectService.updateProject).toHaveBeenCalledWith('proj1', {
        googleTaskListId: null as any,
        syncStatus: null as any,
      });
    });
  });

  describe('triggerSync', () => {
    it('should show alert if no list ID', async () => {
      componentRef.setInput('project', { ...mockProject, googleTaskListId: undefined });
      await component.triggerSync();
      expect(mockDialogService.alert).toHaveBeenCalled();
      expect(mockGoogleTasksSyncService.pullFromGoogleTasks).not.toHaveBeenCalled();
    });

    it('should successfully sync', async () => {
      await component.triggerSync();

      expect(mockProjectService.updateProject).toHaveBeenCalledWith('proj1', {
        syncStatus: 'pending',
      });
      expect(mockGoogleTasksSyncService.pullFromGoogleTasks).toHaveBeenCalledWith(
        'proj1',
        'list1',
        jasmine.any(Date),
      );
      expect(mockProjectService.updateProject).toHaveBeenCalledWith('proj1', {
        syncStatus: 'synced',
        lastSyncAt: jasmine.any(Date),
      });
      expect(component.lastSyncResult()?.success).toBeTrue();
    });

    it('should handle sync errors', async () => {
      spyOn(console, 'error');
      mockProjectService.updateProject.calls.reset();
      mockGoogleTasksSyncService.pullFromGoogleTasks.and.returnValue(Promise.reject('Sync failed'));

      await component.triggerSync();

      expect(mockProjectService.updateProject).toHaveBeenCalledWith('proj1', {
        syncStatus: 'error',
      });
      expect(component.lastSyncResult()?.success).toBeFalse();
    });
  });

  describe('enableScheduledSync', () => {
    it('should not surface a result until the OAuth callback returns', async () => {
      // requestOfflineAccess redirects the browser to Google's consent screen;
      // success is only shown after the OAuth callback returns to the app, so the
      // synchronous path must not set lastSyncResult (regression guard for #173).
      await component.enableScheduledSync();

      expect(mockAuthService.requestOfflineAccess).toHaveBeenCalled();
      expect(component.lastSyncResult()).toBeNull();
      expect(component.enablingScheduledSync()).toBeTrue();
    });

    it('should handle offline access errors', async () => {
      mockAuthService.requestOfflineAccess.and.returnValue(
        Promise.reject(new Error('Failed access')),
      );
      await component.enableScheduledSync();

      expect(component.lastSyncResult()?.success).toBeFalse();
    });
  });

  describe('format functions', () => {
    it('should format sync date properly', () => {
      const date = new Date('2026-01-01T12:00:00.000Z');
      expect(component.formatSyncDate(date)).toContain('1/1/2026');
      expect(component.formatSyncDate(null)).toBe('Never');
    });

    it('should format preview date properly', () => {
      expect(component.formatPreviewDate('2026-01-01T12:00:00.000Z')).toContain('Jan 1');
      expect(component.formatPreviewDate('invalid-date')).toBe('invalid-date'); // fallback
    });
  });

  it('should disconnect Google Tasks on confirmation', async () => {
    await component.disconnectGoogleTasks();
    expect(mockDialogService.confirm).toHaveBeenCalled();
    expect(mockProjectService.updateProject).toHaveBeenCalled();
    expect(component.googleTaskLists()).toEqual([]);
  });

  it('should reconnect by calling auth logout', async () => {
    await component.reconnectGoogleTasks();
    expect(mockAuthService.logout).toHaveBeenCalled();
  });

  it('should toggle and load task preview', async () => {
    await component.toggleTaskPreview();
    expect(component.showTaskPreview()).toBeTrue();
    expect(mockGoogleTasksService.getTasks).toHaveBeenCalledWith('list1');
  });
});

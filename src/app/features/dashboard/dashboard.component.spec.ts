import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { DashboardComponent } from './dashboard.component';
import { AuthService } from '../../core/auth/auth.service';
import { ProjectService } from '../../core/services/project.service';
import { TaskService } from '../../core/services/task.service';
import { SeedDataService } from '../../core/services/seed-data.service';
import { DialogService } from '../../core/services/dialog.service';
import { Router } from '@angular/router';
import { GoogleSheetsSyncService } from '../../core/services/google-sheets-sync.service';
import { GoogleSheetsService } from '../../core/services/google-sheets.service';
import { BehaviorSubject, of } from 'rxjs';
import { signal } from '@angular/core';
import { Project, Task } from '../../core/models/domain.model';
import { SimpleChanges } from '@angular/core';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;

  let mockAuthService: any;
  let mockProjectService: jasmine.SpyObj<ProjectService> & { selectedProjectId: any };
  let mockTaskService: jasmine.SpyObj<TaskService>;
  let mockSeedDataService: jasmine.SpyObj<SeedDataService>;
  let mockDialogService: jasmine.SpyObj<DialogService>;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockSheetsSyncService: jasmine.SpyObj<GoogleSheetsSyncService>;
  let mockSheetsService: jasmine.SpyObj<GoogleSheetsService>;

  beforeEach(async () => {
    mockAuthService = jasmine.createSpyObj('AuthService', ['logout']);
    mockAuthService.currentUserSig = signal<any>(null);
    mockProjectService = jasmine.createSpyObj('ProjectService', [
      'getProject$',
      'addSection',
      'updateProject',
      'getMyProjects',
    ]);
    mockProjectService.selectedProjectId = signal<string | null>(null);
    mockProjectService.getProject$.and.returnValue(of(null));
    mockProjectService.getMyProjects.and.returnValue(of([]));

    mockTaskService = jasmine.createSpyObj('TaskService', ['getTasksByProject', 'deleteTask']);
    mockTaskService.getTasksByProject.and.returnValue(of([]));

    mockSeedDataService = jasmine.createSpyObj('SeedDataService', ['seedIfEmpty']);
    mockSeedDataService.seedIfEmpty.and.returnValue(Promise.resolve(true));

    mockDialogService = jasmine.createSpyObj('DialogService', ['confirm', 'alert']);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    mockSheetsSyncService = jasmine.createSpyObj('GoogleSheetsSyncService', [
      'syncProjectWithSheet',
    ]);
    mockSheetsService = jasmine.createSpyObj('GoogleSheetsService', ['isAuthenticated']);

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: ProjectService, useValue: mockProjectService },
        { provide: TaskService, useValue: mockTaskService },
        { provide: SeedDataService, useValue: mockSeedDataService },
        { provide: DialogService, useValue: mockDialogService },
        { provide: Router, useValue: mockRouter },
        { provide: GoogleSheetsSyncService, useValue: mockSheetsSyncService },
        { provide: GoogleSheetsService, useValue: mockSheetsService },
      ],
    })
      // For standalone components with lots of deep dependencies, sometimes it's easier to just override the template,
      // but we want to test the TS logic, so we let the real template render if possible. If child components fail, we override them.
      .compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create and seed data on init', fakeAsync(() => {
    fixture.detectChanges();
    flush(); // clear Promises from seedSampleDataIfNeeded
    expect(component).toBeTruthy();
    expect(mockSeedDataService.seedIfEmpty).toHaveBeenCalled();
  }));

  it('should open task modal when openCreateTaskModal is called', () => {
    mockProjectService.selectedProjectId.set('p1');
    component.openCreateTaskModal('sec1');
    expect(component.showCreateModal()).toBeTrue();
    expect(component.createModalSectionId()).toBe('sec1');
  });

  it('should close task modal when closeCreateModal is called', () => {
    component.showCreateModal.set(true);
    component.closeCreateModal();
    expect(component.showCreateModal()).toBeFalse();
    expect(component.createModalSectionId()).toBeNull();
  });

  it('should call deleteTask if confirmed', async () => {
    mockDialogService.confirm.and.returnValue(Promise.resolve(true));
    await component.deleteTask('t1');
    expect(mockDialogService.confirm).toHaveBeenCalled();
    expect(mockTaskService.deleteTask).toHaveBeenCalledWith('t1');
  });

  it('should not call deleteTask if not confirmed', async () => {
    mockDialogService.confirm.and.returnValue(Promise.resolve(false));
    await component.deleteTask('t1');
    expect(mockTaskService.deleteTask).not.toHaveBeenCalled();
  });

  it('should add section if prompt returns name', async () => {
    mockProjectService.selectedProjectId.set('p1');
    spyOn(window, 'prompt').and.returnValue('New Section');
    await component.addSection();
    expect(mockProjectService.addSection).toHaveBeenCalledWith('p1', 'New Section');
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProjectDetailComponent } from './project-detail.component';
import { ProjectService } from '../../core/services/project.service';
import { TaskService } from '../../core/services/task.service';
import { DialogService } from '../../core/services/dialog.service';
import { ActivatedRoute, Router } from '@angular/router';
import { of, BehaviorSubject } from 'rxjs';
import { NO_ERRORS_SCHEMA } from '@angular/core';

describe('ProjectDetailComponent', () => {
  let component: ProjectDetailComponent;
  let fixture: ComponentFixture<ProjectDetailComponent>;
  let mockProjectService: any;
  let mockTaskService: any;
  let mockDialogService: any;
  let mockRouter: any;

  let paramMapSubject = new BehaviorSubject<{ get: (key: string) => string | null }>({
    get: () => 'p1',
  });
  let queryParamMapSubject = new BehaviorSubject<{ get: (key: string) => string | null }>({
    get: () => 'overview',
  });

  beforeEach(async () => {
    mockProjectService = jasmine.createSpyObj('ProjectService', ['getProject$']);
    mockProjectService.getProject$.and.returnValue(
      of({ id: 'p1', name: 'Project 1', sections: [], ownerId: 'u1', memberIds: [] }),
    );
    mockProjectService.selectedProjectId = { set: jasmine.createSpy('set') };

    mockTaskService = jasmine.createSpyObj('TaskService', ['getTasksByProject', 'deleteTask']);
    mockTaskService.getTasksByProject.and.returnValue(of([{ id: 't1', title: 'Task 1' }]));
    mockTaskService.deleteTask.and.returnValue(Promise.resolve());

    mockDialogService = jasmine.createSpyObj('DialogService', ['confirm']);
    mockDialogService.confirm.and.returnValue(Promise.resolve(true));

    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [ProjectDetailComponent],
      providers: [
        { provide: ProjectService, useValue: mockProjectService },
        { provide: TaskService, useValue: mockTaskService },
        { provide: DialogService, useValue: mockDialogService },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMapSubject.asObservable(),
            queryParamMap: queryParamMapSubject.asObservable(),
          },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA], // Shallow render to avoid child component dependency issues
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load data', () => {
    expect(component).toBeTruthy();
    expect(component.projectId()).toBe('p1');
    expect(mockProjectService.getProject$).toHaveBeenCalledWith('p1');
    expect(mockTaskService.getTasksByProject).toHaveBeenCalledWith('p1');
    expect(component.project()?.id).toBe('p1');
    expect(component.tasks().length).toBe(1);
  });

  it('should update tab state via effect', () => {
    expect(component.activeTab()).toBe('overview');

    // Test that the effect syncs the global selected project id
    expect(mockProjectService.selectedProjectId.set).toHaveBeenCalledWith('p1');
  });

  it('should go back', () => {
    component.goBack();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/projects']);
  });

  it('should update tab in url', () => {
    component.updateTab('tasks');
    expect(mockRouter.navigate).toHaveBeenCalledWith([], {
      relativeTo: TestBed.inject(ActivatedRoute),
      queryParams: { tab: 'tasks' },
      queryParamsHandling: 'merge',
    });
  });

  it('should open task detail', () => {
    const task = component.tasks()[0];
    component.openTaskDetail(task);
    expect(component.openTask()).toBe(task);
  });

  it('should manage create modal state', () => {
    component.openCreateTaskModal();
    expect(component.showCreateModal()).toBeTrue();

    component.quickAddInBoard('s1');
    expect(component.createModalSectionId()).toBe('s1');
    expect(component.showCreateModal()).toBeTrue();

    const date = new Date();
    component.addTaskForDate(date);
    expect(component.createModalDueDate()).toBe(date);
    expect(component.showCreateModal()).toBeTrue();

    component.closeCreateModal();
    expect(component.showCreateModal()).toBeFalse();
    expect(component.createModalSectionId()).toBeNull();
    expect(component.createModalDueDate()).toBeNull();
  });

  it('should delete task after confirmation', async () => {
    await component.deleteTask('t1');
    expect(mockDialogService.confirm).toHaveBeenCalled();
    expect(mockTaskService.deleteTask).toHaveBeenCalledWith('t1');
  });

  it('should handle project deletion callback', () => {
    component.onProjectDeleted();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/projects']);
  });

  it('should clear openTask on task deleted', () => {
    component.openTask.set(component.tasks()[0]);
    component.onTaskDeleted();
    expect(component.openTask()).toBeNull();
  });
});

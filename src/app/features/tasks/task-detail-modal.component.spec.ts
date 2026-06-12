import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { TaskDetailModalComponent } from './task-detail-modal.component';
import { FormBuilder } from '@angular/forms';
import { TaskService } from '../../core/services/task.service';
import { ProjectService } from '../../core/services/project.service';
import { DialogService } from '../../core/services/dialog.service';
import { ContactsService } from '../../core/services/contacts.service';
import { VertexAiService } from '../../core/services/vertex-ai.service';
import { CustomFieldService } from '../../core/services/custom-field.service';
import { TaskDependencyService } from '../../core/services/task-dependency.service';
import { GithubService } from '../../core/services/github.service';
import { of } from 'rxjs';
import { signal } from '@angular/core';

describe('TaskDetailModalComponent', () => {
  let component: TaskDetailModalComponent;
  let fixture: ComponentFixture<TaskDetailModalComponent>;

  let mockTaskService: any;
  let mockProjectService: any;
  let mockDialogService: any;
  let mockContactsService: any;
  let mockVertexAiService: any;
  let mockCustomFieldService: any;
  let mockTaskDependencyService: any;
  let mockGithubService: any;

  beforeEach(async () => {
    mockTaskService = jasmine.createSpyObj('TaskService', [
      'updateTask',
      'deleteTask',
      'createTask',
      'getTasksByProject',
      'getTask',
    ]);
    mockTaskService.updateTask.and.returnValue(Promise.resolve());
    mockTaskService.deleteTask.and.returnValue(Promise.resolve());
    mockTaskService.createTask.and.returnValue(Promise.resolve({ id: 'new-sub' } as any));
    mockTaskService.getTasksByProject.and.returnValue(of([]));
    mockTaskService.getTask.and.returnValue(Promise.resolve(null));

    mockProjectService = jasmine.createSpyObj('ProjectService', ['getProject$']);
    mockProjectService.getProject$.and.returnValue(
      of({
        id: 'p1',
        name: 'Project 1',
        sections: [{ id: 's1', name: 'Section 1' }],
      }),
    );

    mockDialogService = jasmine.createSpyObj('DialogService', ['confirm', 'alert']);
    mockDialogService.confirm.and.returnValue(Promise.resolve(true));

    mockContactsService = jasmine.createSpyObj('ContactsService', ['searchContacts']);
    mockContactsService.searchContacts.and.returnValue(of([]));

    mockVertexAiService = jasmine.createSpyObj('VertexAiService', [
      'generateSubtasks',
      'enhanceDescription',
    ]);

    mockVertexAiService.generatingSubtasks = signal(false);
    mockVertexAiService.enhancingDescription = signal(false);

    mockCustomFieldService = jasmine.createSpyObj('CustomFieldService', ['getCustomFields']);
    mockCustomFieldService.getCustomFields.and.returnValue(of([]));

    mockTaskDependencyService = jasmine.createSpyObj('TaskDependencyService', [
      'addDependency',
      'removeDependency',
    ]);
    mockTaskDependencyService.addDependency.and.returnValue(Promise.resolve());
    mockTaskDependencyService.removeDependency.and.returnValue(Promise.resolve());

    mockGithubService = jasmine.createSpyObj('GithubService', [
      'loadConnection',
      'watchTaskLink',
      'watchTaskFieldValues',
      'watchTaskActors',
      'watchTaskRelationships',
    ]);
    mockGithubService.connection = signal({ connected: false });
    mockGithubService.loadConnection.and.returnValue(Promise.resolve({ connected: false }));
    mockGithubService.watchTaskLink.and.returnValue(of(null));
    mockGithubService.watchTaskFieldValues.and.returnValue(of([]));
    mockGithubService.watchTaskActors.and.returnValue(of([]));
    mockGithubService.watchTaskRelationships.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [TaskDetailModalComponent],
      providers: [
        FormBuilder,
        { provide: TaskService, useValue: mockTaskService },
        { provide: ProjectService, useValue: mockProjectService },
        { provide: DialogService, useValue: mockDialogService },
        { provide: ContactsService, useValue: mockContactsService },
        { provide: VertexAiService, useValue: mockVertexAiService },
        { provide: CustomFieldService, useValue: mockCustomFieldService },
        { provide: TaskDependencyService, useValue: mockTaskDependencyService },
        { provide: GithubService, useValue: mockGithubService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskDetailModalComponent);
    component = fixture.componentInstance;

    // Provide inputs
    fixture.componentRef.setInput('task', {
      id: 't1',
      title: 'Task 1',
      description: 'Desc',
      priority: 'medium',
      status: 'todo',
    });
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit close on backdrop click', () => {
    spyOn(component.close, 'emit');
    const ev = { target: 1, currentTarget: 1 } as any;

    if ((component as any).onBackdropClick) {
      (component as any).onBackdropClick(ev);
    } else if ((component as any).onExampleClick) {
      (component as any).onExampleClick(ev);
    }

    expect(component.close.emit).toHaveBeenCalled();
  });
});

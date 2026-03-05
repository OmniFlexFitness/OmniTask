import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { TaskDetailModalComponent } from './task-detail-modal.component';
import { FormBuilder } from '@angular/forms';
import { TaskService } from '../../core/services/task.service';
import { ProjectService } from '../../core/services/project.service';
import { DialogService } from '../../core/services/dialog.service';
import { ContactsService } from '../../core/services/contacts.service';
import { VertexAiService } from '../../core/services/vertex-ai.service';
import { CustomFieldService } from '../../core/services/custom-field.service';
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

  beforeEach(async () => {
    mockTaskService = jasmine.createSpyObj('TaskService', ['updateTask', 'deleteTask']);
    mockTaskService.updateTask.and.returnValue(Promise.resolve());
    mockTaskService.deleteTask.and.returnValue(Promise.resolve());

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

  it('should generate subtasks via AI and update task', async () => {
    mockVertexAiService.generateSubtasks.and.returnValue(
      Promise.resolve([{ id: 'sub1', title: 'New Sub', completed: false }]),
    );

    await component.aiGenerateSubtasks();

    expect(mockVertexAiService.generateSubtasks).toHaveBeenCalled();
    expect(mockTaskService.updateTask).toHaveBeenCalled();
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

import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { TaskCreateModalComponent } from './task-create-modal.component';
import { FormBuilder } from '@angular/forms';
import { TaskService } from '../../core/services/task.service';
import { ProjectService } from '../../core/services/project.service';
import { ContactsService } from '../../core/services/contacts.service';
import { VertexAiService } from '../../core/services/vertex-ai.service';
import { BehaviorSubject, of } from 'rxjs';
import { signal } from '@angular/core';

describe('TaskCreateModalComponent', () => {
  let component: TaskCreateModalComponent;
  let fixture: ComponentFixture<TaskCreateModalComponent>;

  let mockTaskService: any;
  let mockProjectService: any;
  let mockContactsService: any;
  let mockVertexAiService: any;

  beforeEach(async () => {
    mockTaskService = jasmine.createSpyObj('TaskService', ['createTask']);
    mockTaskService.createTask.and.returnValue(Promise.resolve({ id: 't1' } as any));

    mockProjectService = jasmine.createSpyObj('ProjectService', ['getProject$']);
    mockProjectService.getProject$.and.returnValue(
      of({
        id: 'p1',
        name: 'Project 1',
        sections: [{ id: 's1', name: 'Section 1' }],
      }),
    );

    mockContactsService = jasmine.createSpyObj('ContactsService', ['searchContacts']);
    mockContactsService.searchContacts.and.returnValue(of([]));

    mockVertexAiService = jasmine.createSpyObj('VertexAiService', [
      'generateSubtasks',
      'suggestPriority',
      'suggestDueDate',
    ]);
    mockVertexAiService.generatingSubtasks = signal(false);
    mockVertexAiService.suggestingPriority = signal(false);
    mockVertexAiService.suggestingDueDate = signal(false);

    await TestBed.configureTestingModule({
      imports: [TaskCreateModalComponent],
      providers: [
        FormBuilder,
        { provide: TaskService, useValue: mockTaskService },
        { provide: ProjectService, useValue: mockProjectService },
        { provide: ContactsService, useValue: mockContactsService },
        { provide: VertexAiService, useValue: mockVertexAiService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskCreateModalComponent);
    component = fixture.componentInstance;

    // Set required inputs:
    fixture.componentRef.setInput('projectId', 'p1');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Since fakeAsync is used or async/await, we handle Promises
  it('should generate subtasks via AI', async () => {
    mockVertexAiService.generateSubtasks.and.returnValue(Promise.resolve(['sub1', 'sub2']));
    component.form.patchValue({ title: 'do something' });

    await component.aiGenerateSubtasks();

    expect(mockVertexAiService.generateSubtasks).toHaveBeenCalled();
    expect(component.aiSubtasks().length).toBe(2);
  });

  it('should emit close when backdrop is clicked', () => {
    spyOn(component.close, 'emit');
    component.onBackdropClick({ target: null, currentTarget: null } as any);
    expect(component.close.emit).toHaveBeenCalled();
  });
});

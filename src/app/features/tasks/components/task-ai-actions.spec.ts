import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskAiActionsComponent } from './task-ai-actions';
import { VertexAiService } from '../../../core/services/vertex-ai.service';
import { TaskService } from '../../../core/services/task.service';
import { DialogService } from '../../../core/services/dialog.service';
import { Task } from '../../../core/models/domain.model';

describe('TaskAiActionsComponent', () => {
  let component: TaskAiActionsComponent;
  let fixture: ComponentFixture<TaskAiActionsComponent>;
  let vertexAiMock: { generateSubtasks: jasmine.Spy; enhanceDescription: jasmine.Spy };

  beforeEach(async () => {
    vertexAiMock = {
      generateSubtasks: jasmine.createSpy('generateSubtasks'),
      enhanceDescription: jasmine.createSpy('enhanceDescription'),
    };
    const taskServiceMock = { createTask: jasmine.createSpy('createTask') };

    await TestBed.configureTestingModule({
      imports: [TaskAiActionsComponent],
      providers: [
        { provide: VertexAiService, useValue: vertexAiMock },
        { provide: TaskService, useValue: taskServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskAiActionsComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('type', 'generateSubtasks');
    fixture.componentRef.setInput('task', null);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the backend message in a dialog when the AI call fails', async () => {
    const task = { id: 't1', title: 'Write launch post', projectId: 'p1' } as unknown as Task;
    fixture.componentRef.setInput('task', task);
    vertexAiMock.generateSubtasks.and.rejectWith({
      code: 'functions/failed-precondition',
      message: 'AI features are not configured.',
    });

    await component.executeAction();

    const dialog = TestBed.inject(DialogService).dialog();
    expect(dialog.isOpen).toBeTrue();
    expect(dialog.title).toBe('AI Assist');
    expect(dialog.message).toBe('AI features are not configured.');
    expect(component.loading()).toBeFalse();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskAiActionsComponent } from './task-ai-actions';
import { VertexAiService } from '../../../core/services/vertex-ai.service';
import { TaskService } from '../../../core/services/task.service';

describe('TaskAiActionsComponent', () => {
  let component: TaskAiActionsComponent;
  let fixture: ComponentFixture<TaskAiActionsComponent>;

  beforeEach(async () => {
    const vertexAiMock = {};
    const taskServiceMock = {};

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
});

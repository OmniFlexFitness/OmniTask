import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskAiSuggestionsComponent } from './task-ai-suggestions';
import { VertexAiService } from '../../../core/services/vertex-ai.service';

describe('TaskAiSuggestionsComponent', () => {
  let component: TaskAiSuggestionsComponent;
  let fixture: ComponentFixture<TaskAiSuggestionsComponent>;

  beforeEach(async () => {
    const vertexAiMock = {
      suggestPriority: jasmine.createSpy('suggestPriority'),
      suggestDueDate: jasmine.createSpy('suggestDueDate'),
      generateSubtasks: jasmine.createSpy('generateSubtasks'),
    };

    await TestBed.configureTestingModule({
      imports: [TaskAiSuggestionsComponent],
      providers: [{ provide: VertexAiService, useValue: vertexAiMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskAiSuggestionsComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('type', 'subtasks');
    fixture.componentRef.setInput('subtasks', []);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

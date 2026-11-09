import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskAiSuggestionsComponent } from './task-ai-suggestions';
import { VertexAiService } from '../../../core/services/vertex-ai.service';
import { DialogService } from '../../../core/services/dialog.service';
import { GENERIC_AI_ERROR_MESSAGE } from '../../../core/services/ai-error.util';

describe('TaskAiSuggestionsComponent', () => {
  let component: TaskAiSuggestionsComponent;
  let fixture: ComponentFixture<TaskAiSuggestionsComponent>;
  let vertexAiMock: {
    suggestPriority: jasmine.Spy;
    suggestDueDate: jasmine.Spy;
    generateSubtasks: jasmine.Spy;
  };

  beforeEach(async () => {
    vertexAiMock = {
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

  it('emits the suggested priority on success', async () => {
    fixture.componentRef.setInput('type', 'priority');
    fixture.componentRef.setInput('title', 'Fix checkout bug');
    vertexAiMock.suggestPriority.and.resolveTo({ priority: 'high', reasoning: 'Blocks launch.' });
    const emitted: string[] = [];
    component.suggestedPriority.subscribe((p) => emitted.push(p));

    await component.onSuggest();

    expect(emitted).toEqual(['high']);
    expect(component.loading()).toBeFalse();
  });

  it('shows a generic dialog when the AI call fails without a callable message', async () => {
    fixture.componentRef.setInput('type', 'priority');
    fixture.componentRef.setInput('title', 'Fix checkout bug');
    vertexAiMock.suggestPriority.and.rejectWith(new TypeError('Failed to fetch'));

    await component.onSuggest();

    const dialog = TestBed.inject(DialogService).dialog();
    expect(dialog.isOpen).toBeTrue();
    expect(dialog.title).toBe('AI Assist');
    expect(dialog.message).toBe(GENERIC_AI_ERROR_MESSAGE);
    expect(component.loading()).toBeFalse();
  });
});

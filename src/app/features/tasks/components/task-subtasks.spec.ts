import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskSubtasksComponent } from './task-subtasks';
import { TaskService } from '../../../core/services/task.service';

describe('TaskSubtasksComponent', () => {
  let component: TaskSubtasksComponent;
  let fixture: ComponentFixture<TaskSubtasksComponent>;

  beforeEach(async () => {
    const taskServiceMock = {
      createTask: jasmine.createSpy('createTask').and.returnValue(Promise.resolve({ id: '1' })),
    };

    await TestBed.configureTestingModule({
      imports: [TaskSubtasksComponent],
      providers: [{ provide: TaskService, useValue: taskServiceMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskSubtasksComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('task', null);
    fixture.componentRef.setInput('project', null);
    fixture.componentRef.setInput('subtasks', []);
    fixture.componentRef.setInput('assigneeOptions', []);
    fixture.componentRef.setInput('generateAvatarColor', () => '#000');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskDetailHeaderComponent } from './task-detail-header';

describe('TaskDetailHeaderComponent', () => {
  let component: TaskDetailHeaderComponent;
  let fixture: ComponentFixture<TaskDetailHeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskDetailHeaderComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskDetailHeaderComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('task', null);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

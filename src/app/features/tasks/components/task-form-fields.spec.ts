import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { TaskFormFieldsComponent } from './task-form-fields';

describe('TaskFormFieldsComponent', () => {
  let component: TaskFormFieldsComponent;
  let fixture: ComponentFixture<TaskFormFieldsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskFormFieldsComponent],
    }).compileComponents();

    const fb = TestBed.inject(FormBuilder);
    fixture = TestBed.createComponent(TaskFormFieldsComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('form', fb.group({}));
    fixture.componentRef.setInput('priorityOptions', []);
    fixture.componentRef.setInput('sectionOptions', []);
    fixture.componentRef.setInput('availableAssigneeOptions', []);
    fixture.componentRef.setInput('selectedAssignees', []);
    fixture.componentRef.setInput('notifyAssignees', true);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

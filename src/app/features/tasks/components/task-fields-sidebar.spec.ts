import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { TaskFieldsSidebarComponent } from './task-fields-sidebar';

describe('TaskFieldsSidebarComponent', () => {
  let component: TaskFieldsSidebarComponent;
  let fixture: ComponentFixture<TaskFieldsSidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskFieldsSidebarComponent],
    }).compileComponents();

    const fb = TestBed.inject(FormBuilder);
    fixture = TestBed.createComponent(TaskFieldsSidebarComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('form', fb.group({}));
    fixture.componentRef.setInput('selectedAssignees', []);
    fixture.componentRef.setInput('availableAssigneeOptions', []);
    fixture.componentRef.setInput('notifyAssigneesSig', true);
    fixture.componentRef.setInput('statusOptions', []);
    fixture.componentRef.setInput('priorityOptions', []);
    fixture.componentRef.setInput('sectionOptions', []);
    fixture.componentRef.setInput('projectCustomFields', []);
    fixture.componentRef.setInput('customFieldValues', {});
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

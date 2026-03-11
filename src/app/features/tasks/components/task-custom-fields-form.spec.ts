import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskCustomFieldsFormComponent } from './task-custom-fields-form';

describe('TaskCustomFieldsFormComponent', () => {
  let component: TaskCustomFieldsFormComponent;
  let fixture: ComponentFixture<TaskCustomFieldsFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskCustomFieldsFormComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskCustomFieldsFormComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('customFields', []);
    fixture.componentRef.setInput('customFieldErrors', {});
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

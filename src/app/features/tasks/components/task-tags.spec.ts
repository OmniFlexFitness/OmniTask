import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskTagsComponent } from './task-tags';
import { ProjectService } from '../../../core/services/project.service';

describe('TaskTagsComponent', () => {
  let component: TaskTagsComponent;
  let fixture: ComponentFixture<TaskTagsComponent>;

  beforeEach(async () => {
    const projectServiceMock = { addTag: jasmine.createSpy('addTag') };

    await TestBed.configureTestingModule({
      imports: [TaskTagsComponent],
      providers: [{ provide: ProjectService, useValue: projectServiceMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskTagsComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('project', null);
    fixture.componentRef.setInput('selectedTags', new Set());
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

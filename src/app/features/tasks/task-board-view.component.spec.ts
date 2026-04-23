import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskBoardViewComponent } from './task-board-view.component';
import { TaskService } from '../../core/services/task.service';
import { ProjectService } from '../../core/services/project.service';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { OverlayModule } from '@angular/cdk/overlay';
import { NO_ERRORS_SCHEMA } from '@angular/core';

describe('TaskBoardViewComponent', () => {
  let component: TaskBoardViewComponent;
  let fixture: ComponentFixture<TaskBoardViewComponent>;
  let mockTaskService: any;
  let mockProjectService: any;

  beforeEach(async () => {
    mockTaskService = jasmine.createSpyObj('TaskService', ['updateTask', 'deleteTask']);
    mockTaskService.updateTask.and.returnValue(Promise.resolve());

    mockProjectService = jasmine.createSpyObj('ProjectService', ['updateProject']);
    mockProjectService.updateProject.and.returnValue(Promise.resolve());

    await TestBed.configureTestingModule({
      imports: [TaskBoardViewComponent, DragDropModule, OverlayModule],
      providers: [
        { provide: TaskService, useValue: mockTaskService },
        { provide: ProjectService, useValue: mockProjectService },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskBoardViewComponent);
    component = fixture.componentInstance;

    // Set required inputs
    fixture.componentRef.setInput('tasks', [
      {
        id: 't1',
        title: 'Task 1',
        sectionId: 's1',
        status: 'todo',
        order: 0,
        createdAt: new Date(),
      },
    ]);
    fixture.componentRef.setInput('project', {
      id: 'p1',
      name: 'Project 1',
      sections: [{ id: 's1', name: 'Section 1', order: 0 }],
    });

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle selection mode', () => {
    component.toggleSelectionMode();
    expect(component.selectionMode()).toBeTrue();

    component.toggleTaskSelection('t1');
    expect(component.selectedTaskIds().has('t1')).toBeTrue();
  });
});

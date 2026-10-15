import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { TaskBoardViewComponent } from './task-board-view.component';
import { TaskService } from '../../core/services/task.service';
import { ProjectService } from '../../core/services/project.service';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { OverlayModule } from '@angular/cdk/overlay';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { generateMockTask } from '../../../testing/mock-data';
import { Task } from '../../core/models/domain.model';

describe('TaskBoardViewComponent', () => {
  let component: TaskBoardViewComponent;
  let fixture: ComponentFixture<TaskBoardViewComponent>;
  let mockTaskService: jasmine.SpyObj<TaskService>;
  let mockProjectService: jasmine.SpyObj<ProjectService>;

  beforeEach(async () => {
    mockTaskService = jasmine.createSpyObj('TaskService', [
      'updateTask',
      'deleteTask',
      'setTaskParent',
      'reorderTasks',
    ]);
    mockTaskService.updateTask.and.returnValue(Promise.resolve());
    mockTaskService.setTaskParent.and.returnValue(Promise.resolve());
    mockTaskService.reorderTasks.and.returnValue(Promise.resolve());

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

  describe('drag-to-nest subtask', () => {
    it('wouldCreateParentCycle detects direct and transitive cycles', () => {
      fixture.componentRef.setInput('tasks', [
        generateMockTask({ id: 'parent', parentId: null, sectionId: 's1' }),
        generateMockTask({ id: 'child', parentId: 'parent', sectionId: 's1' }),
        generateMockTask({ id: 'grandchild', parentId: 'child', sectionId: 's1' }),
      ]);
      fixture.detectChanges();

      expect(component.wouldCreateParentCycle('parent', 'child')).toBeTrue();
      expect(component.wouldCreateParentCycle('parent', 'grandchild')).toBeTrue();
      expect(component.wouldCreateParentCycle('child', 'parent')).toBeFalse();
    });

    it('onNestDrop calls setTaskParent and clears drag state', fakeAsync(() => {
      const parent = generateMockTask({ id: 'p1', title: 'Parent', sectionId: 's1' });
      const child = generateMockTask({ id: 'c1', title: 'Child', parentId: null, sectionId: 's1' });
      fixture.componentRef.setInput('tasks', [parent, child]);
      fixture.detectChanges();

      component.onDragStarted();
      expect(component.isDragging()).toBeTrue();

      const event = {
        previousContainer: { id: 's1' },
        container: { id: 'board-nest-p1' },
        item: { data: child },
      } as unknown as CdkDragDrop<any>;

      component.onNestDrop(event, parent);
      tick();

      expect(mockTaskService.setTaskParent).toHaveBeenCalledWith('c1', 'p1');
      expect(component.isDragging()).toBeFalse();
      expect(component.nestDropTargetId()).toBeNull();
    }));

    it('onNestDrop rejects self-nest and cycles', () => {
      const parent = generateMockTask({ id: 'parent', parentId: null, sectionId: 's1' });
      const child = generateMockTask({ id: 'child', parentId: 'parent', sectionId: 's1' });
      fixture.componentRef.setInput('tasks', [parent, child]);
      fixture.detectChanges();

      const selfEvent = {
        previousContainer: { id: 's1' },
        container: { id: 'board-nest-parent' },
        item: { data: parent },
      } as unknown as CdkDragDrop<any>;

      component.onNestDrop(selfEvent, parent);
      expect(mockTaskService.setTaskParent).not.toHaveBeenCalled();

      const cycleEvent = {
        previousContainer: { id: 's1' },
        container: { id: 'board-nest-child' },
        item: { data: parent },
      } as unknown as CdkDragDrop<any>;

      component.onNestDrop(cycleEvent, child);
      expect(mockTaskService.setTaskParent).not.toHaveBeenCalled();
    });
  });
});

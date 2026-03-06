import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { TaskListViewComponent } from './task-list-view.component';
import { TaskService } from '../../core/services/task.service';
import { generateMockTask } from '../../../testing/mock-data';
import { ComponentRef } from '@angular/core';
import { ProjectService } from '../../core/services/project.service';
import { CustomFieldService } from '../../core/services/custom-field.service';
import { of } from 'rxjs';

describe('TaskListViewComponent', () => {
  let component: TaskListViewComponent;
  let fixture: ComponentFixture<TaskListViewComponent>;
  let componentRef: ComponentRef<TaskListViewComponent>;
  let mockTaskService: jasmine.SpyObj<TaskService>;
  let mockProjectService: any;
  let mockCustomFieldService: any;

  beforeEach(async () => {
    mockTaskService = jasmine.createSpyObj('TaskService', [
      'bulkUpdateTasks',
      'completeTask',
      'reopenTask',
    ]);

    mockProjectService = jasmine.createSpyObj('ProjectService', ['getProject$']);
    mockProjectService.getProject$.and.returnValue(of({ id: 'p1', customFieldIds: [] }));

    mockCustomFieldService = jasmine.createSpyObj('CustomFieldService', ['getCustomFields']);
    mockCustomFieldService.getCustomFields.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [TaskListViewComponent],
      providers: [
        { provide: TaskService, useValue: mockTaskService },
        { provide: ProjectService, useValue: mockProjectService },
        { provide: CustomFieldService, useValue: mockCustomFieldService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskListViewComponent);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;

    // Set initial tasks
    componentRef.setInput('projectId', 'p1');
    componentRef.setInput('tasks', [
      generateMockTask({ id: 't1', title: 'A task', priority: 'high', status: 'todo' }),
      generateMockTask({ id: 't2', title: 'B task', priority: 'medium', status: 'in-progress' }),
      generateMockTask({
        id: 't3',
        title: 'C task',
        priority: 'low',
        status: 'done',
        completedAt: new Date(Date.now() - 60 * 60 * 1000) as any,
      }), // completed 1 hr ago
      generateMockTask({
        id: 't4',
        title: 'D task',
        priority: 'low',
        status: 'done',
        completedAt: new Date() as any,
      }), // completed just now
    ]);

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('filtering', () => {
    it('should hide old completed tasks by default', () => {
      // t3 is completed 1 hr ago, should be hidden
      // t4 is completed just now, should be visible
      expect(component.filteredTasks().length).toBe(3);
      expect(component.filteredTasks().map((t) => t.id)).not.toContain('t3');
    });

    it('should show all tasks when showCompleted is true', () => {
      component.toggleShowCompleted();
      fixture.detectChanges();

      expect(component.filteredTasks().length).toBe(4);
      expect(component.showCompleted()).toBeTrue();
    });

    it('should correctly report hidden completed count', () => {
      expect(component.hiddenCompletedCount()).toBe(1); // t3 is hidden
    });
  });

  describe('sorting', () => {
    beforeEach(() => {
      // ensure we see all tasks for deterministic sort testing
      component.showCompleted.set(true);
    });

    it('should sort by title descending', () => {
      component.sortField.set('title');
      component.sortDirection.set('desc');

      const titles = component.sortedTasks().map((t) => t.title);
      // Completed tasks always go to bottom by logic
      expect(titles[0]).toBe('B task');
      expect(titles[1]).toBe('A task');
      // t3, t4 are done
    });

    it('should toggle sort field and direction', () => {
      expect(component.sortField()).toBe('title');
      expect(component.sortDirection()).toBe('asc');

      component.toggleSort('priority');
      expect(component.sortField()).toBe('priority');
      expect(component.sortDirection()).toBe('asc');

      component.toggleSort('priority');
      expect(component.sortDirection()).toBe('desc');
    });
  });

  describe('selection and bulk actions', () => {
    it('should toggle selection mode and clear selection when disabling', () => {
      component.toggleSelectionMode();
      expect(component.selectionMode()).toBeTrue();

      component.toggleTaskSelection('t1');
      expect(component.selectedTaskIds().size).toBe(1);

      component.toggleSelectionMode();
      expect(component.selectionMode()).toBeFalse();
      expect(component.selectedTaskIds().size).toBe(0);
    });

    it('should select all visible tasks', () => {
      component.selectAllVisible();
      // t1, t2, t4 are visible
      expect(component.selectedTaskIds().size).toBe(3);
      expect(component.allVisibleSelected()).toBeTrue();

      component.selectAllVisible(); // deselect all
      expect(component.selectedTaskIds().size).toBe(0);
      expect(component.allVisibleSelected()).toBeFalse();
    });

    it('should call bulkComplete', fakeAsync(() => {
      component.toggleTaskSelection('t1');
      component.toggleTaskSelection('t2');

      component.bulkComplete();
      tick();

      expect(mockTaskService.bulkUpdateTasks).toHaveBeenCalled();
      const args = mockTaskService.bulkUpdateTasks.calls.mostRecent().args;
      expect(args[0]).toEqual(['t1', 't2']);
      expect(args[1].status).toBe('done');
      expect(component.selectedTaskIds().size).toBe(0); // selection cleared
    }));

    it('should call bulkReopen', fakeAsync(() => {
      component.toggleTaskSelection('t3');

      component.bulkReopen();
      tick();

      expect(mockTaskService.bulkUpdateTasks).toHaveBeenCalled();
      const args = mockTaskService.bulkUpdateTasks.calls.mostRecent().args;
      expect(args[0]).toEqual(['t3']);
      expect(args[1].status).toBe('todo');
      expect(args[1].completedAt).toBeNull();
      expect(component.selectedTaskIds().size).toBe(0);
    }));
  });

  describe('single actions', () => {
    it('should complete task if not done', () => {
      const task = generateMockTask({ status: 'todo' });
      component.toggleCompletion(task);
      expect(mockTaskService.completeTask).toHaveBeenCalledWith(task.id, undefined);
    });

    it('should reopen task if done', () => {
      const task = generateMockTask({ status: 'done' });
      component.toggleCompletion(task);
      expect(mockTaskService.reopenTask).toHaveBeenCalledWith(task.id, undefined);
    });
  });
});

import { Injectable, inject, OnDestroy } from '@angular/core';
import { TaskService } from './task.service';
import { Subscription } from 'rxjs';
import { ProjectService } from './project.service';
import { AutomationRule, Task, Condition, Trigger, Action } from '../models/domain.model';

@Injectable({
  providedIn: 'root'
})
export class AutomationService implements OnDestroy {
  private taskService = inject(TaskService);
  private projectService = inject(ProjectService);
  private sub = new Subscription();

  constructor() {
    this.sub.add(
      this.taskService.taskMutation$.subscribe(async (mutation) => {
        await this.handleTaskMutation(mutation);
      })
    );
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  private async handleTaskMutation(mutation: { taskId: string; projectId: string; changes: Partial<Task>; task: Task }) {
    if (!mutation.projectId) return;
    const project = await this.projectService.getProject(mutation.projectId);
    if (!project || !project.automationRules || project.automationRules.length === 0) return;

    for (const rule of project.automationRules) {
      if (!rule.enabled) continue;
      
      if (this.evaluateTrigger(rule.trigger, mutation) && this.evaluateConditions(rule.conditions || [], mutation.task)) {
        await this.executeActions(rule.actions, mutation);
      }
    }
  }

  private evaluateTrigger(trigger: Trigger, mutation: { changes: Partial<Task>; task: Task }): boolean {
    if (trigger.type === 'field_change') {
      // Check if the specified field has changed
      return trigger.field !== undefined && mutation.changes[trigger.field as keyof Task] !== undefined;
    }
    // Handle other trigger types if needed (e.g. task_created, task_completed)
    if (trigger.type === 'task_created') {
      // Assuming a task has just been created if 'createdAt' is in changes (just an example, depends on what we emit)
      return mutation.changes.createdAt !== undefined;
    }
    if (trigger.type === 'task_completed') {
      return mutation.changes.status === 'done';
    }
    return false;
  }

  private evaluateConditions(conditions: Condition[], task: Task): boolean {
    if (!conditions || conditions.length === 0) return true;
    
    for (const condition of conditions) {
      const taskValue = task[condition.field as keyof Task];
      switch (condition.operator) {
        case 'equals':
          if (taskValue !== condition.value) return false;
          break;
        case 'not_equals':
          if (taskValue === condition.value) return false;
          break;
        case 'contains':
          if (typeof taskValue !== 'string' || !taskValue.includes(condition.value as string)) return false;
          break;
        case 'greater_than':
          if (Number(taskValue) <= Number(condition.value)) return false;
          break;
        case 'less_than':
          if (Number(taskValue) >= Number(condition.value)) return false;
          break;
        default:
          return false;
      }
    }
    return true;
  }

  private async executeActions(actions: Action[], mutation: { taskId: string; projectId: string; task: Task }) {
    for (const action of actions) {
      if (action.type === 'update_field' && action.field) {
        // ensure we map statuses correctly
        if (action.field === 'status') {
          await this.taskService.updateTask(mutation.taskId, { [action.field]: action.value as Task['status'] });
        } else if (action.field === 'priority') {
          await this.taskService.updateTask(mutation.taskId, { [action.field]: action.value as Task['priority'] });
        } else {
          // generic update
          await this.taskService.updateTask(mutation.taskId, { [action.field]: action.value });
        }
      }
    }
  }
}

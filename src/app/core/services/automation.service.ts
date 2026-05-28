import { Injectable, inject } from '@angular/core';
import { AutomationAction, AutomationRule } from '../models/automation.model';
import { Project, Task } from '../models/domain.model';
import { ProjectService } from './project.service';
import { TaskService } from './task.service';

@Injectable({ providedIn: 'root' })
export class AutomationService {
  private readonly projectService = inject(ProjectService);
  private readonly taskService = inject(TaskService);

  async saveRules(projectId: string, rules: AutomationRule[]): Promise<void> {
    await this.projectService.updateProject(projectId, { automationRules: rules });
  }

  /**
   * Evaluate project automation rules after a task update.
   * Runs client-side for immediate feedback.
   */
  async evaluateTaskUpdate(
    project: Project,
    before: Task,
    after: Task,
  ): Promise<void> {
    const rules = project.automationRules?.filter((r) => r.enabled) ?? [];
    if (rules.length === 0) return;

    for (const rule of rules) {
      const previous = this.fieldValue(before, rule.field);
      const current = this.fieldValue(after, rule.field);
      if (current !== rule.value || previous === current) continue;

      for (const action of rule.actions) {
        await this.applyAction(after.id, action);
      }
    }
  }

  private fieldValue(task: Task, field: AutomationRule['field']): string {
    if (field === 'sectionId') return task.sectionId ?? '';
    return String(task[field] ?? '');
  }

  private async applyAction(taskId: string, action: AutomationAction): Promise<void> {
    if (action.type === 'update_field' && action.field && action.value !== undefined) {
      await this.taskService.updateTask(taskId, { [action.field]: action.value } as Partial<Task>);
      return;
    }
    if (action.type === 'move_section' && action.sectionId) {
      await this.taskService.updateTask(taskId, { sectionId: action.sectionId });
    }
  }
}

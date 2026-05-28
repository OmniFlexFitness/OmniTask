import { Injectable, inject } from '@angular/core';
import { AutomationRule } from '../models/automation.model';
import { Project, Task } from '../models/domain.model';
import { ProjectService } from './project.service';
import { TaskService } from './task.service';
import {
  automationActionToTaskPatch,
  getMatchingAutomationActions,
} from './automation.util';

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
  async evaluateTaskUpdate(project: Project, before: Task, after: Task): Promise<void> {
    const rules = project.automationRules ?? [];
    const actions = getMatchingAutomationActions(rules, before, after);

    for (const action of actions) {
      const patch = automationActionToTaskPatch(action);
      if (patch) {
        await this.taskService.updateTask(after.id, patch);
      }
    }
  }
}

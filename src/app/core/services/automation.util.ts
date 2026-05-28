import { AutomationAction, AutomationRule, AutomationTriggerField } from '../models/automation.model';
import { Task } from '../models/domain.model';

export function taskFieldValue(task: Task, field: AutomationTriggerField): string {
  if (field === 'sectionId') return task.sectionId ?? '';
  return String(task[field] ?? '');
}

/** Returns actions from enabled rules that match a task field change. */
export function getMatchingAutomationActions(
  rules: AutomationRule[],
  before: Task,
  after: Task,
): AutomationAction[] {
  const actions: AutomationAction[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    const previous = taskFieldValue(before, rule.field);
    const current = taskFieldValue(after, rule.field);
    if (current !== rule.value || previous === current) continue;

    actions.push(...rule.actions);
  }

  return actions;
}

export function automationActionToTaskPatch(action: AutomationAction): Partial<Task> | null {
  if (action.type === 'update_field' && action.field && action.value !== undefined) {
    return { [action.field]: action.value } as Partial<Task>;
  }
  if (action.type === 'move_section' && action.sectionId) {
    return { sectionId: action.sectionId };
  }
  return null;
}

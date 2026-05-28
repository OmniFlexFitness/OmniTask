import { getMatchingAutomationActions, automationActionToTaskPatch, taskFieldValue } from './automation.util';
import { AutomationRule } from '../models/automation.model';
import { Task } from '../models/domain.model';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    projectId: 'proj-1',
    title: 'Test',
    status: 'todo',
    priority: 'medium',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Task;
}

describe('automation.util', () => {
  describe('taskFieldValue', () => {
    it('reads sectionId as empty string when unset', () => {
      expect(taskFieldValue(makeTask(), 'sectionId')).toBe('');
    });
  });

  describe('getMatchingAutomationActions', () => {
    const rule: AutomationRule = {
      id: 'rule-1',
      name: 'Done → high priority',
      enabled: true,
      field: 'status',
      value: 'done',
      actions: [{ type: 'update_field', field: 'priority', value: 'high' }],
    };

    it('returns actions when the watched field changes to the trigger value', () => {
      const before = makeTask({ status: 'in-progress' });
      const after = makeTask({ status: 'done' });

      const actions = getMatchingAutomationActions([rule], before, after);

      expect(actions).toEqual(rule.actions);
    });

    it('skips disabled rules and unchanged fields', () => {
      const before = makeTask({ status: 'todo' });
      const after = makeTask({ status: 'done' });
      const disabled = { ...rule, enabled: false };

      expect(getMatchingAutomationActions([disabled], before, after)).toEqual([]);
      expect(getMatchingAutomationActions([rule], after, after)).toEqual([]);
    });
  });

  describe('automationActionToTaskPatch', () => {
    it('maps move_section to sectionId patch', () => {
      expect(
        automationActionToTaskPatch({ type: 'move_section', sectionId: 'sec-2' }),
      ).toEqual({ sectionId: 'sec-2' });
    });
  });
});

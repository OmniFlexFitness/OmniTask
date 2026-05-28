export type AutomationTriggerField = 'status' | 'priority' | 'sectionId';

export type AutomationActionType = 'update_field' | 'move_section';

export interface AutomationAction {
  type: AutomationActionType;
  field?: AutomationTriggerField;
  value?: string;
  sectionId?: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  field: AutomationTriggerField;
  /** When the field equals this value after an update, run actions. */
  value: string;
  actions: AutomationAction[];
}

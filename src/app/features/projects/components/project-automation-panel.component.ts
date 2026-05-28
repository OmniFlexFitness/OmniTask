import { Component, input, output, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Project } from '../../../core/models/domain.model';
import {
  AutomationAction,
  AutomationRule,
  AutomationTriggerField,
} from '../../../core/models/automation.model';
import { AutomationService } from '../../../core/services/automation.service';

const STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

@Component({
  selector: 'app-project-automation-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './project-automation-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectAutomationPanelComponent {
  private readonly automationService = inject(AutomationService);

  project = input.required<Project>();
  projectChanged = output<void>();

  showAddForm = signal(false);
  saving = signal(false);

  newName = '';
  newField: AutomationTriggerField = 'status';
  newValue = '';
  newActionType: AutomationAction['type'] = 'update_field';
  newActionField: AutomationTriggerField = 'priority';
  newActionValue = '';
  newSectionId = '';

  readonly fieldOptions: AutomationTriggerField[] = ['status', 'priority', 'sectionId'];
  readonly statusOptions = STATUS_OPTIONS;
  readonly priorityOptions = PRIORITY_OPTIONS;

  sectionOptions = computed(() => this.project().sections ?? []);

  rules(): AutomationRule[] {
    return this.project().automationRules ?? [];
  }

  fieldLabel(field: AutomationTriggerField, value: string): string {
    if (field === 'status') {
      return STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;
    }
    if (field === 'priority') {
      return PRIORITY_OPTIONS.find((o) => o.value === value)?.label ?? value;
    }
    if (field === 'sectionId') {
      if (!value) return 'No Section';
      return this.sectionOptions().find((s) => s.id === value)?.name ?? value;
    }
    return value;
  }

  cancelAdd(): void {
    this.showAddForm.set(false);
    this.resetForm();
  }

  async addRule(): Promise<void> {
    if (!this.newName.trim() || !this.newValue.trim()) return;
    if (this.newActionType === 'move_section' && !this.newSectionId.trim()) return;
    if (this.newActionType === 'update_field' && !this.newActionValue.trim()) return;

    const action: AutomationAction =
      this.newActionType === 'move_section'
        ? { type: 'move_section', sectionId: this.newSectionId.trim() }
        : {
            type: 'update_field',
            field: this.newActionField,
            value: this.newActionValue.trim(),
          };

    const rule: AutomationRule = {
      id: crypto.randomUUID(),
      name: this.newName.trim(),
      enabled: true,
      field: this.newField,
      value: this.newValue.trim(),
      actions: [action],
    };

    this.saving.set(true);
    try {
      await this.automationService.saveRules(this.project().id, [...this.rules(), rule]);
      this.cancelAdd();
      this.projectChanged.emit();
    } catch (err) {
      console.error('Failed to save automation rule:', err);
    } finally {
      this.saving.set(false);
    }
  }

  async toggleRule(rule: AutomationRule): Promise<void> {
    const next = this.rules().map((r) =>
      r.id === rule.id ? { ...r, enabled: !r.enabled } : r,
    );
    await this.automationService.saveRules(this.project().id, next);
    this.projectChanged.emit();
  }

  async deleteRule(rule: AutomationRule): Promise<void> {
    const next = this.rules().filter((r) => r.id !== rule.id);
    await this.automationService.saveRules(this.project().id, next);
    this.projectChanged.emit();
  }

  onTriggerFieldChange(): void {
    if (this.newField === 'status') this.newValue = 'done';
    else if (this.newField === 'priority') this.newValue = 'high';
    else this.newValue = this.sectionOptions()[0]?.id ?? '';
  }

  onActionFieldChange(): void {
    if (this.newActionField === 'status') this.newActionValue = 'todo';
    else if (this.newActionField === 'priority') this.newActionValue = 'medium';
    else this.newActionValue = this.sectionOptions()[0]?.id ?? '';
  }

  private resetForm(): void {
    this.newName = '';
    this.newField = 'status';
    this.newValue = 'done';
    this.newActionType = 'update_field';
    this.newActionField = 'priority';
    this.newActionValue = 'medium';
    this.newSectionId = this.sectionOptions()[0]?.id ?? '';
  }
}

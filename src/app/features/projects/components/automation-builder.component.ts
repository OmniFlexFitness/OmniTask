import { Component, input, output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Project, AutomationRule, Trigger, Condition, Action } from '../../../core/models/domain.model';
import { ProjectService } from '../../../core/services/project.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-automation-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './automation-builder.component.html',
  styleUrls: ['./automation-builder.component.css']
})
export class AutomationBuilderComponent {
  project = input.required<Project>();
  rulesChanged = output<void>();

  private projectService = inject(ProjectService);
  private toast = inject(ToastService);

  isEditing = signal(false);
  editingRule = signal<Partial<AutomationRule> | null>(null);

  // For the UI builder
  availableTriggers = [
    { value: 'task_completed', label: 'Task completed' },
    { value: 'task_created', label: 'Task created' },
    { value: 'field_change', label: 'Field changed' }
  ];

  startNewRule() {
    this.editingRule.set({
      id: crypto.randomUUID(),
      projectId: this.project().id,
      name: 'New Rule',
      enabled: true,
      trigger: { type: 'task_completed' },
      conditions: [],
      actions: [{ type: 'update_field', field: 'status', value: 'done' }]
    });
    this.isEditing.set(true);
  }

  editRule(rule: AutomationRule) {
    // deep clone so we don't accidentally mutate the state until saved
    this.editingRule.set(JSON.parse(JSON.stringify(rule)));
    this.isEditing.set(true);
  }

  cancelEdit() {
    this.editingRule.set(null);
    this.isEditing.set(false);
  }

  async saveRule() {
    const currentRule = this.editingRule();
    if (!currentRule || !currentRule.name) return;

    try {
      const currentRules = [...(this.project().automationRules || [])];
      const index = currentRules.findIndex(r => r.id === currentRule.id);

      if (index >= 0) {
        currentRules[index] = currentRule as AutomationRule;
      } else {
        currentRules.push(currentRule as AutomationRule);
      }

      await this.projectService.updateProject(this.project().id, {
        automationRules: currentRules
      });
      this.toast.success('Automation rule saved successfully');
      this.cancelEdit();
      this.rulesChanged.emit();
    } catch (err) {
      this.toast.error('Failed to save automation rule');
      console.error(err);
    }
  }

  async deleteRule(ruleId: string) {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    
    try {
      const currentRules = (this.project().automationRules || []).filter(r => r.id !== ruleId);
      await this.projectService.updateProject(this.project().id, {
        automationRules: currentRules
      });
      this.toast.success('Rule deleted');
      this.rulesChanged.emit();
    } catch (err) {
      this.toast.error('Failed to delete rule');
      console.error(err);
    }
  }

  async toggleRuleExecution(rule: AutomationRule, event: Event) {
    const checkbox = event.target as HTMLInputElement;
    rule.enabled = checkbox.checked;
    
    try {
      const currentRules = [...(this.project().automationRules || [])];
      const index = currentRules.findIndex(r => r.id === rule.id);
      if (index >= 0) {
        currentRules[index] = rule;
        await this.projectService.updateProject(this.project().id, {
          automationRules: currentRules
        });
      }
    } catch (err) {
      // Revert UI on failure
      checkbox.checked = !checkbox.checked;
      rule.enabled = checkbox.checked;
      this.toast.error('Failed to toggle rule');
    }
  }

  addCondition() {
    const rule = this.editingRule();
    if (rule) {
      rule.conditions = rule.conditions || [];
      rule.conditions.push({ field: 'priority', operator: 'equals', value: 'high' });
    }
  }

  removeCondition(index: number) {
    const rule = this.editingRule();
    if (rule?.conditions) {
      rule.conditions.splice(index, 1);
    }
  }

  addAction() {
    const rule = this.editingRule();
    if (rule) {
      rule.actions = rule.actions || [];
      rule.actions.push({ type: 'update_field', field: 'status', value: 'done' });
    }
  }

  removeAction(index: number) {
    const rule = this.editingRule();
    if (rule?.actions) {
      rule.actions.splice(index, 1);
    }
  }
}

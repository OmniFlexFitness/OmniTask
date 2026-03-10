import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CustomFieldDefinition } from '../../../core/models/domain.model';

@Component({
  selector: 'app-task-custom-fields-form',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './task-custom-fields-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskCustomFieldsFormComponent {
  customFields = input.required<CustomFieldDefinition[]>();
  customFieldErrors = input.required<Record<string, string>>();

  fieldUpdated = output<{ fieldId: string; value: any }>();

  onFieldUpdate(event: Event, fieldId: string) {
    const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    this.fieldUpdated.emit({ fieldId, value: target.value });
  }

  onCheckboxUpdate(event: Event, fieldId: string) {
    const target = event.target as HTMLInputElement;
    this.fieldUpdated.emit({ fieldId, value: target.checked });
  }

  getMultiSelectValues(event: Event): string[] {
    const target = event.target as HTMLSelectElement;
    return Array.from(target.selectedOptions).map((o) => o.value);
  }
}

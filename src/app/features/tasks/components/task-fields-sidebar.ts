import { Component, input, output, ChangeDetectionStrategy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import {
  AutocompleteInputComponent,
  AutocompleteOption,
} from '../../../shared/components/autocomplete-input/autocomplete-input.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../shared/components/custom-select/custom-select.component';
import { CustomDatePickerComponent } from '../../../shared/components/custom-date-picker/custom-date-picker.component';
import { Task, CustomFieldDefinition } from '../../../core/models/domain.model';
import { GroupPickerComponent } from '../../../shared/components/group-picker/group-picker.component';
import { UserGroupMember } from '../../../core/models/user-group.model';

@Component({
  selector: 'app-task-fields-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AutocompleteInputComponent,
    CustomSelectComponent,
    CustomDatePickerComponent,
    GroupPickerComponent,
  ],
  templateUrl: './task-fields-sidebar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskFieldsSidebarComponent {
  form = input.required<FormGroup>();

  selectedAssignees = input.required<AutocompleteOption[]>();
  availableAssigneeOptions = input.required<AutocompleteOption[]>();
  notifyAssigneesSig = input.required<boolean>();

  statusOptions = input.required<SelectOption[]>();
  priorityOptions = input.required<SelectOption[]>();
  sectionOptions = input.required<SelectOption[]>();

  projectCustomFields = input.required<CustomFieldDefinition[]>();
  customFieldValues = input.required<Record<string, any>>();

  assigneeSearch = output<string>();
  assigneeSelected = output<AutocompleteOption | string>();
  assigneeRemoved = output<string>();
  notifyAssigneesChange = output<boolean>();
  applyGroup = output<UserGroupMember[]>();

  customFieldUpdated = output<{ fieldId: string; value: any }>();

  autoSave = output<void>();

  onNotifyAssigneesChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.notifyAssigneesChange.emit(input.checked);
  }

  onCustomFieldUpdate(event: Event, fieldId: string): void {
    const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    this.customFieldUpdated.emit({ fieldId, value: target.value });
  }

  onCustomFieldCheckboxUpdate(event: Event, fieldId: string): void {
    const target = event.target as HTMLInputElement;
    this.customFieldUpdated.emit({ fieldId, value: target.checked });
  }

  getMultiSelectValues(event: Event): string[] {
    const target = event.target as HTMLSelectElement;
    return Array.from(target.selectedOptions).map((o) => o.value);
  }
}

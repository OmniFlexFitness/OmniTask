import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
  AutocompleteInputComponent,
  AutocompleteOption,
} from '../../../shared/components/autocomplete-input/autocomplete-input.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../../shared/components/custom-select/custom-select.component';
import { CustomDatePickerComponent } from '../../../shared/components/custom-date-picker/custom-date-picker.component';
import { MarkdownEditorComponent } from '../../../shared/components/markdown-editor/markdown-editor.component';

@Component({
  selector: 'app-task-form-fields',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AutocompleteInputComponent,
    CustomSelectComponent,
    CustomDatePickerComponent,
    MarkdownEditorComponent,
  ],
  templateUrl: './task-form-fields.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskFormFieldsComponent {
  form = input.required<FormGroup>();
  priorityOptions = input.required<SelectOption[]>();
  sectionOptions = input.required<SelectOption[]>();
  availableAssigneeOptions = input.required<AutocompleteOption[]>();
  selectedAssignees = input.required<AutocompleteOption[]>();
  notifyAssignees = input.required<boolean>();

  assigneeSearch = output<string>();
  assigneeSelected = output<AutocompleteOption | string>();
  assigneeRemoved = output<string>();
  notifyAssigneesChange = output<boolean>();

  onNotifyAssigneesChange(event: Event) {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.notifyAssigneesChange.emit(isChecked);
  }
}

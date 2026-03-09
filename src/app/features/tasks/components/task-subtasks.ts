import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Task } from '../../../core/models/domain.model';
import { MarkdownEditorComponent } from '../../../shared/components/markdown-editor/markdown-editor.component';
import {
  AutocompleteInputComponent,
  AutocompleteOption,
} from '../../../shared/components/autocomplete-input/autocomplete-input.component';

@Component({
  selector: 'app-task-subtasks',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownEditorComponent, AutocompleteInputComponent],
  templateUrl: './task-subtasks.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskSubtasksComponent {
  subtasks = input.required<Task[]>();
  completedSubtasksCount = input.required<number>();
  expandedSubtaskIds = input.required<Set<string>>();
  assigneeOptions = input.required<AutocompleteOption[]>();

  toggleSubtaskExpanded = output<string>();
  toggleSubtask = output<string>();
  deleteSubtask = output<string>();
  updateSubtaskDescription = output<{ subtaskId: string; description: string }>();
  autoSave = output<void>();

  addSubtask = output<string>();

  subtaskAssigneeSelected = output<{ subtaskId: string; selection: AutocompleteOption | string }>();
  removeSubtaskAssignee = output<{ subtaskId: string; index: number }>();

  generateAvatarColor = input.required<(email: string) => string>();

  newSubtaskTitle = '';

  onAddSubtask() {
    if (this.newSubtaskTitle.trim()) {
      this.addSubtask.emit(this.newSubtaskTitle.trim());
      this.newSubtaskTitle = '';
    }
  }
}

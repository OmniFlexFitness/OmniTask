import {
  Component,
  input,
  model,
  output,
  inject,
  ChangeDetectionStrategy,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Task, Project } from '../../../core/models/domain.model';
import { TaskService } from '../../../core/services/task.service';
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
  private taskService = inject(TaskService);

  task = input.required<Task | null>();
  project = input.required<Project | null>();

  subtasks = model.required<Task[]>();
  completedSubtasksCount = computed(
    () => this.subtasks().filter((s) => s.status === 'done').length,
  );

  assigneeOptions = input.required<AutocompleteOption[]>();
  generateAvatarColor = input.required<(email: string) => string>();

  autoSave = output<void>(); // Parent autoSave if needed

  newSubtaskTitle = '';
  expandedSubtaskIds = model<Set<string>>(new Set());

  // Local actions
  toggleSubtaskExpanded(subtaskId: string) {
    const current = new Set(this.expandedSubtaskIds());
    if (current.has(subtaskId)) {
      current.delete(subtaskId);
    } else {
      current.add(subtaskId);
    }
    this.expandedSubtaskIds.set(current);
  }

  async onAddSubtask() {
    const title = this.newSubtaskTitle.trim();
    const currentTask = this.task();
    const currentProject = this.project();

    if (!title || !currentTask) return;
    this.newSubtaskTitle = '';

    try {
      const docRef = await this.taskService.createTask(
        {
          projectId: currentTask.projectId,
          title: title,
          status: 'todo',
          priority: 'medium',
          order: this.subtasks().length,
          parentId: currentTask.id,
          description: '',
        },
        currentProject?.googleTaskListId,
      );

      // Optimistic local update
      this.subtasks.update((list) => [
        ...list,
        {
          id: docRef.id,
          projectId: currentTask.projectId,
          title,
          status: 'todo',
          priority: 'medium',
          order: list.length,
          parentId: currentTask.id,
          description: '',
          tags: [],
          subtasks: [],
          createdById: '',
          assigneeIds: [],
        } as unknown as Task,
      ]);
    } catch (e) {
      console.error('Failed to add subtask', e);
    }
  }

  async toggleSubtask(subtaskId: string) {
    const currentTask = this.task();
    const currentProject = this.project();
    if (!currentTask) return;

    const subtask = this.subtasks().find((s) => s.id === subtaskId);
    if (!subtask) return;

    const newStatus = subtask.status === 'done' ? 'todo' : 'done';
    try {
      if (subtask.status === 'done') {
        await this.taskService.reopenTask(subtaskId, currentProject?.googleTaskListId);
      } else {
        await this.taskService.completeTask(subtaskId, currentProject?.googleTaskListId);
      }

      this.subtasks.update((list) =>
        list.map((s) => (s.id === subtaskId ? { ...s, status: newStatus as Task['status'] } : s)),
      );
    } catch (e) {
      console.error('Failed to toggle subtask', e);
    }
  }

  async deleteSubtask(subtaskId: string) {
    const currentTask = this.task();
    const currentProject = this.project();
    if (!currentTask) return;

    try {
      await this.taskService.deleteTask(subtaskId, currentProject?.googleTaskListId);
      this.subtasks.update((list) => list.filter((s) => s.id !== subtaskId));
    } catch (e) {
      console.error('Failed to delete subtask', e);
    }
  }

  async updateSubtaskDescription(subtaskId: string, description: string) {
    try {
      await this.taskService.updateTask(subtaskId, { description });
      this.subtasks.update((list) =>
        list.map((s) => (s.id === subtaskId ? { ...s, description } : s)),
      );
    } catch (e) {
      console.error('Failed to update description', e);
    }
  }

  async subtaskAssigneeSelected(subtaskId: string, selection: AutocompleteOption | string) {
    if (typeof selection !== 'object') return;

    const subtask = this.subtasks().find((s) => s.id === subtaskId);
    if (!subtask) return;

    const ids = [...(subtask.assigneeIds || [])];
    const names = [...(subtask.assigneeNames || [])];
    if (!ids.includes(selection.id)) {
      ids.push(selection.id);
      names.push(selection.label);
    }

    try {
      await this.taskService.updateTask(subtaskId, { assigneeIds: ids, assigneeNames: names });
      this.subtasks.update((list) =>
        list.map((s) =>
          s.id === subtaskId ? { ...s, assigneeIds: ids, assigneeNames: names } : s,
        ),
      );
      this.autoSave.emit();
    } catch (e) {
      console.error('Failed to assign subtask', e);
    }
  }

  async removeSubtaskAssignee(subtaskId: string, index: number) {
    const subtask = this.subtasks().find((s) => s.id === subtaskId);
    if (!subtask) return;

    const ids = [...(subtask.assigneeIds || [])];
    const names = [...(subtask.assigneeNames || [])];
    ids.splice(index, 1);
    names.splice(index, 1);

    try {
      await this.taskService.updateTask(subtaskId, { assigneeIds: ids, assigneeNames: names });
      this.subtasks.update((list) =>
        list.map((s) =>
          s.id === subtaskId ? { ...s, assigneeIds: ids, assigneeNames: names } : s,
        ),
      );
      this.autoSave.emit();
    } catch (e) {
      console.error('Failed to unassign subtask', e);
    }
  }
}

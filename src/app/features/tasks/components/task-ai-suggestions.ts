import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subtask } from '../../../core/models/domain.model';

@Component({
  selector: 'app-task-ai-suggestions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './task-ai-suggestions.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskAiSuggestionsComponent {
  type = input.required<'priority' | 'dueDate' | 'subtasks'>();
  disabled = input<boolean>(false);
  loading = input<boolean>(false);
  subtasks = input<Subtask[]>([]);

  suggest = output<void>();
  removeSubtask = output<number>();
}

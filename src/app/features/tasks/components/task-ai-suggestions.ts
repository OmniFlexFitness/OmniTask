import {
  Component,
  input,
  output,
  model,
  signal,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subtask } from '../../../core/models/domain.model';
import { VertexAiService } from '../../../core/services/vertex-ai.service';
import { DialogService } from '../../../core/services/dialog.service';
import { aiErrorMessage } from '../../../core/services/ai-error.util';

@Component({
  selector: 'app-task-ai-suggestions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './task-ai-suggestions.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskAiSuggestionsComponent {
  private vertexAiService = inject(VertexAiService);
  private dialogService = inject(DialogService);

  type = input.required<'priority' | 'dueDate' | 'subtasks'>();
  disabled = input<boolean>(false);
  title = input<string>('');
  description = input<string>('');
  currentDueDate = input<string>('');
  projectName = input<string>('');

  subtasks = model<Subtask[]>([]);

  suggestedPriority = output<string>();
  suggestedDueDate = output<string>();

  loading = signal(false);

  async onSuggest() {
    if (!this.title().trim()) return;
    this.loading.set(true);
    try {
      if (this.type() === 'priority') {
        const res = await this.vertexAiService.suggestPriority(
          this.title(),
          this.description() || undefined,
          this.currentDueDate() || undefined,
        );
        this.suggestedPriority.emit(res.priority);
      } else if (this.type() === 'dueDate') {
        const res = await this.vertexAiService.suggestDueDate(
          this.title(),
          this.description() || undefined,
        );
        this.suggestedDueDate.emit(res.dueDate);
      } else if (this.type() === 'subtasks') {
        const res = await this.vertexAiService.generateSubtasks(
          this.title(),
          this.description() || undefined,
          this.projectName() || undefined,
        );
        this.subtasks.set(res);
      }
    } catch (err) {
      console.error('Failed AI suggestion:', err);
      // Surface the failure; the backend already phrases these for end users.
      this.dialogService
        .alert(aiErrorMessage(err), 'AI Assist')
        .catch((dialogErr) => console.error('Failed to show AI error dialog:', dialogErr));
    } finally {
      this.loading.set(false);
    }
  }

  removeSubtask(index: number) {
    const current = this.subtasks();
    this.subtasks.set(current.filter((_, i) => i !== index));
  }
}

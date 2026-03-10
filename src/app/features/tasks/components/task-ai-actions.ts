import { Component, input, output, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Task, Project } from '../../../core/models/domain.model';
import { VertexAiService } from '../../../core/services/vertex-ai.service';
import { TaskService } from '../../../core/services/task.service';

@Component({
  selector: 'app-task-ai-actions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './task-ai-actions.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskAiActionsComponent {
  private vertexAiService = inject(VertexAiService);
  private taskService = inject(TaskService);

  type = input.required<'generateSubtasks' | 'enhanceDescription'>();
  task = input.required<Task | null>();
  project = input<Project | null>(null);
  currentDescription = input<string>('');
  subtaskCount = input<number>(0);
  disabled = input<boolean>(false);

  descriptionEnhanced = output<string>();
  subtasksGenerated = output<void>();

  loading = signal<boolean>(false);

  static readonly MAX_AI_SUBTASKS = 6;

  async executeAction() {
    const currentTask = this.task();
    if (!currentTask?.title?.trim() || this.disabled()) return;

    this.loading.set(true);
    try {
      if (this.type() === 'generateSubtasks') {
        let newSubtasks = await this.vertexAiService.generateSubtasks(
          currentTask.title,
          this.currentDescription() || undefined,
          this.project()?.name,
        );

        if (newSubtasks.length > TaskAiActionsComponent.MAX_AI_SUBTASKS) {
          newSubtasks = newSubtasks.slice(0, TaskAiActionsComponent.MAX_AI_SUBTASKS);
        }

        const googleId = this.project()?.googleTaskListId;
        for (const st of newSubtasks) {
          await this.taskService.createTask(
            {
              title: st.title,
              description: st.description || '',
              projectId: currentTask.projectId,
              parentId: currentTask.id,
              status: 'todo',
              priority: 'medium',
              order: this.subtaskCount(),
            },
            googleId,
          );
        }
        this.subtasksGenerated.emit();
      } else if (this.type() === 'enhanceDescription') {
        if (!this.currentDescription()?.trim()) return;
        const enhanced = await this.vertexAiService.enhanceDescription(
          currentTask.title,
          this.currentDescription(),
        );
        this.descriptionEnhanced.emit(enhanced.enhancedDescription);
      }
    } catch (err) {
      console.error(`AI ${this.type()} failed:`, err);
    } finally {
      this.loading.set(false);
    }
  }
}

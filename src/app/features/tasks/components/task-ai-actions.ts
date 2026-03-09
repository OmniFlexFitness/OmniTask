import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-task-ai-actions',
  standalone: true,
  templateUrl: './task-ai-actions.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskAiActionsComponent {
  taskTitle = input.required<string>();
  generatingSubtasks = input.required<boolean>();

  aiGenerateSubtasks = output<void>();
}

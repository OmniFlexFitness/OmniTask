import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Task } from '../../../core/models/domain.model';

@Component({
  selector: 'app-task-detail-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './task-detail-header.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskDetailHeaderComponent {
  task = input<Task | null>(null);

  toggleComplete = output<void>();
  deleteTask = output<void>();
  closeDialog = output<void>();
}

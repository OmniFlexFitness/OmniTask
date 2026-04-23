import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TaskBoardViewComponent } from '../tasks/task-board-view.component';
import { Task, Project, DEFAULT_SECTIONS } from '../../core/models/domain.model';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-board-demo',
  standalone: true,
  imports: [CommonModule, TaskBoardViewComponent],
  templateUrl: './board-demo.component.html',
})
export class BoardDemoComponent {
  demoProject = signal<Project>({
    id: 'demo-project',
    name: 'Cyberpunk Enhancement Demo',
    description: 'Showcasing the new board view styling',
    ownerId: 'demo-user',
    memberIds: [],
    sections: DEFAULT_SECTIONS.map((s, i) => ({
      ...s,
      id: `section-${i}`,
    })),
    status: 'active',
    createdAt: new Date(),
  });

  demoTasks = signal<Task[]>([
    {
      id: 'task-1',
      projectId: 'demo-project',
      sectionId: 'section-0',
      title: 'Design new landing page',
      description: 'Create wireframes and mockups',
      status: 'todo',
      priority: 'high',
      order: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      assigneeName: 'Alex Chen',
    },
    {
      id: 'task-4',
      projectId: 'demo-project',
      sectionId: 'section-1',
      title: 'Implement authentication',
      description: 'OAuth 2.0 integration',
      status: 'in-progress',
      priority: 'high',
      order: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      assigneeName: 'Sam Rivera',
    },
    {
      id: 'task-6',
      projectId: 'demo-project',
      sectionId: 'section-2',
      title: 'Setup project structure',
      description: 'Initialize Angular project',
      status: 'done',
      priority: 'high',
      order: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: new Date(Date.now() - 60 * 60 * 1000),
      assigneeName: 'Casey Morgan',
    },
  ]);

  onTaskClick(task: Task) {
    console.log('Task clicked:', task);
  }

  onQuickAdd(sectionId: string) {
    console.log('Quick add for section:', sectionId);
  }

  onAddSection() {
    console.log('Add new section');
  }
}

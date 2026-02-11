import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TaskBoardViewComponent } from '../tasks/task-board-view.component';
import { Task, Project, DEFAULT_SECTIONS } from '../../core/models/domain.model';

@Component({
  selector: 'app-board-demo',
  standalone: true,
  imports: [CommonModule, TaskBoardViewComponent],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
      <div class="max-w-7xl mx-auto">
        <div class="mb-8 text-center">
          <h1 class="text-4xl font-bold mb-3" style="text-shadow: 0 0 8px rgba(224, 64, 251, 0.8), 0 0 16px rgba(224, 64, 251, 0.6), 0 0 24px rgba(0, 210, 255, 0.4);">
            Board View - Cyberpunk Enhancement Demo
          </h1>
          <p class="text-slate-400 text-lg">
            Showcasing enhanced column styling, task color accents, and dormant state effects
          </p>
        </div>

        <div class="rounded-xl overflow-hidden border border-white/10 bg-slate-900/30 backdrop-blur-xl">
          <app-task-board-view
            [tasks]="demoTasks()"
            [project]="demoProject()"
            (taskClick)="onTaskClick($event)"
            (quickAdd)="onQuickAdd($event)"
            (addSection)="onAddSection()"
          />
        </div>
      </div>
    </div>
  `,
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

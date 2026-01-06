import { Component, input, output, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Task } from '../../core/models/domain.model';
import { TaskService } from '../../core/services/task.service';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-task-list-view',
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
  template: `
    <div class="flex flex-col h-full bg-[#0a0f1e]/60 rounded-xl overflow-hidden border border-cyan-500/10 shadow-[0_0_20px_rgba(0,210,255,0.05)]">
      <!-- Cyberpunk Header -->
      <div class="grid grid-cols-[auto_1fr_120px_120px_120px_auto] gap-4 px-4 py-3 bg-[#0a0f1e]/80 border-b border-fuchsia-500/20 text-xs font-bold uppercase tracking-[0.15em]">
        <div class="w-6"></div> <!-- Drag handle placeholder -->
        <div class="cursor-pointer text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1" (click)="toggleSort('title')">
          <span class="text-neon-blue">Task Name</span>
          <span *ngIf="sortField() === 'title'" class="ml-1 text-purple-400">{{ sortDirection() === 'asc' ? '↑' : '↓' }}</span>
        </div>
        <div class="cursor-pointer text-slate-500 hover:text-cyan-400 transition-colors" (click)="toggleSort('dueDate')">
          Due Date
          <span *ngIf="sortField() === 'dueDate'" class="ml-1 text-purple-400">{{ sortDirection() === 'asc' ? '↑' : '↓' }}</span>
        </div>
        <div class="cursor-pointer text-slate-500 hover:text-cyan-400 transition-colors" (click)="toggleSort('priority')">
          Priority
          <span *ngIf="sortField() === 'priority'" class="ml-1 text-purple-400">{{ sortDirection() === 'asc' ? '↑' : '↓' }}</span>
        </div>
        <div class="cursor-pointer text-slate-500 hover:text-cyan-400 transition-colors" (click)="toggleSort('status')">
          Status
          <span *ngIf="sortField() === 'status'" class="ml-1 text-purple-400">{{ sortDirection() === 'asc' ? '↑' : '↓' }}</span>
        </div>
        <div class="w-8"></div> <!-- Actions placeholder -->
      </div>

      <!-- Task List -->
      <div 
        cdkDropList 
        [cdkDropListData]="sortedTasks()"
        (cdkDropListDropped)="onDrop($event)"
        class="overflow-y-auto flex-1 divide-y divide-cyan-500/5"
      >
        @if (sortedTasks().length === 0) {
          <div class="flex flex-col items-center justify-center p-12 text-slate-500">
            <div class="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-cyan-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p class="mb-2 text-cyan-400/70">No tasks found</p>
            <p class="text-xs text-slate-600">Create a task to get started</p>
          </div>
        }

        @for (task of sortedTasks(); track task.id) {
          <div 
            cdkDrag
            [cdkDragData]="task"
            [class.opacity-50]="task.status === 'done'"
            class="group grid grid-cols-[auto_1fr_120px_120px_120px_auto] gap-4 px-4 py-3 items-center hover:bg-cyan-500/5 transition-all cursor-pointer bg-[#0a0f1e]/80 border-l-2 border-transparent hover:border-cyan-500/50"
            (click)="taskClick.emit(task)"
          >
            <!-- Custom Drag Preview -->
            <div *cdkDragPreview class="bg-[#0a0f1e] p-4 rounded-lg shadow-[0_0_20px_rgba(0,210,255,0.2)] border border-cyan-500/30 flex items-center gap-3">
              <span class="text-white font-medium">{{ task.title }}</span>
            </div>

            <!-- Drag Handle -->
            <div cdkDragHandle class="w-6 h-6 flex items-center justify-center text-slate-600 hover:text-cyan-400 cursor-grab active:cursor-grabbing transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
              </svg>
            </div>

            <!-- Title & ID -->
            <div class="flex items-center gap-3 overflow-hidden">
              <div 
                class="w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer transition-colors"
                [class.border-cyan-500]="task.status === 'done'"
                [class.bg-cyan-500]="task.status === 'done'"
                [class.border-slate-500]="task.status !== 'done'"
                [class.hover:border-cyan-400]="task.status !== 'done'"
                (click)="$event.stopPropagation(); toggleCompletion(task)"
              >
                @if (task.status === 'done') {
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                }
              </div>
              <span class="truncate font-medium text-sm text-slate-200" [class.line-through]="task.status === 'done'" [class.text-slate-500]="task.status === 'done'">
                {{ task.title }}
              </span>
              @if (task.isGoogleTask) {
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              }
            </div>

            <!-- Due Date -->
            <div class="text-sm truncate" [class.text-rose-400]="isOverdue(task)" [class.text-slate-400]="!isOverdue(task)">
              {{ formatDate(task.dueDate) }}
            </div>

            <!-- Priority -->
            <div>
              <span 
                class="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider"
                [ngClass]="{
                  'bg-rose-500/10 text-rose-400 border border-rose-500/20': task.priority === 'high',
                  'bg-amber-500/10 text-amber-400 border border-amber-500/20': task.priority === 'medium',
                  'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20': task.priority === 'low'
                }"
              >
                {{ task.priority }}
              </span>
            </div>

            <!-- Status -->
            <div>
              <span class="text-xs text-slate-400 capitalize bg-white/5 px-2 py-1 rounded">
                {{ task.status.replace('-', ' ') }}
              </span>
            </div>

            <!-- Actions -->
            <div class="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                class="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded transition-colors"
                (click)="$event.stopPropagation(); delete.emit(task.id)"
                title="Delete Task"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `
})
export class TaskListViewComponent {
  private taskService = inject(TaskService);

  tasks = input.required<Task[]>();
  taskClick = output<Task>();
  delete = output<string>();

  sortField = signal<'title' | 'dueDate' | 'priority' | 'status'>('title');
  sortDirection = signal<'asc' | 'desc'>('asc');

  sortedTasks = computed(() => {
    const tasks = [...this.tasks()];
    const field = this.sortField();
    const direction = this.sortDirection();

    return tasks.sort((a, b) => {
      let comparison = 0;
      
      switch (field) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'dueDate':
          const dA: any = a.dueDate;
          const dB: any = b.dueDate;
          const dateA = dA ? (dA.toDate ? dA.toDate() : new Date(dA)) : new Date(8640000000000000);
          const dateB = dB ? (dB.toDate ? dB.toDate() : new Date(dB)) : new Date(8640000000000000);
          comparison = dateA.getTime() - dateB.getTime();
          break;
        case 'priority':
          const priorityMap = { high: 3, medium: 2, low: 1 };
          comparison = priorityMap[a.priority] - priorityMap[b.priority];
          break;
        case 'status':
          const statusMap = { 'todo': 1, 'in-progress': 2, 'done': 3 };
          comparison = statusMap[a.status] - statusMap[b.status];
          break;
      }

      return direction === 'asc' ? comparison : -comparison;
    });
  });

  toggleSort(field: 'title' | 'dueDate' | 'priority' | 'status') {
    if (this.sortField() === field) {
      this.sortDirection.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortDirection.set('asc');
    }
  }

  formatDate(date: any): string {
    if (!date) return '-';
    // Handle Firestore Timestamp or Date object
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  isOverdue(task: Task): boolean {
    if (task.status === 'done' || !task.dueDate) return false;
    const dateVal: any = task.dueDate;
    const due = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return due < now;
  }

  toggleCompletion(task: Task) {
    if (task.status === 'done') {
      this.taskService.reopenTask(task.id);
    } else {
      this.taskService.completeTask(task.id);
    }
  }

  onDrop(event: CdkDragDrop<Task[]>) {
    // Only reorder if sorting is not active (or implement complex reorder with sort logic)
    // For now, simpler to just allow visual reorder but warn or disable if sorted?
    // Let's assume reorder updates the 'order' field.
    
    // NOTE: In a real grouped list, this logic needs to be robust. 
    // Here we just emit the reorder event or handle it via service
    
    // Ideally we update the order of all items
    // This part requires calculating new order values
    // For simplicity in this demo, we'll skip DB reorder logic in sorted lists
    // and only implement it for drag-drop in Board view where it matters more.
    // However, if we want to persist list order:
    
    const prevIndex = this.tasks().findIndex(t => t.id === event.item.data.id);
    const newIndex = event.currentIndex; // This index is relative to the sorted list view
    
    // Implementation of reorder is best handled in the parent or service
    // For this step, since we have sorting enabled, drag-drop reordering is visually tricky.
    // We'll leave the event hooks but maybe disable drag if sort != manual?
    // Or just accept the drop and let the sort re-arrange it back if sort is active.
    
    // Move for visual feedback (optional since data update will trigger re-render)
    // moveItemInArray(this.tasks(), event.previousIndex, event.currentIndex);
  }
}

import { Component, input, output, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { Task, Section, Project } from '../../core/models/domain.model';
import { TaskService } from '../../core/services/task.service';
import { ProjectService } from '../../core/services/project.service';

@Component({
  selector: 'app-task-board-view',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  template: `
    <div class="h-full overflow-x-auto overflow-y-hidden">
      <div class="h-full flex gap-6 pb-4 min-w-max">
        @for (section of projectSections(); track section.id) {
        <div
          class="board-column flex flex-col bg-slate-900/40 rounded-xl border border-white/5 h-full max-h-full"
        >
          <!-- Column Header -->
          <div
            class="p-4 flex items-center justify-between border-b border-white/5 handle cursor-grab active:cursor-grabbing"
          >
            <div class="flex items-center gap-3">
              <span
                class="w-3 h-3 rounded-full"
                [style.background]="section.color || '#64748b'"
                [style.box-shadow]="'0 0 8px ' + (section.color || '#64748b') + '60'"
              ></span>
              <h3 class="font-bold text-slate-200 text-sm tracking-wide">{{ section.name }}</h3>
              <span class="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">
                {{ getTasksForSection(section.id).length }}
              </span>
            </div>
            <button
              class="text-slate-500 hover:text-white transition-colors"
              (click)="showColumnMenu(section)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                />
              </svg>
            </button>
          </div>

          <!-- Task List -->
          <div
            cdkDropList
            [id]="section.id"
            [cdkDropListData]="getTasksForSection(section.id)"
            [cdkDropListConnectedTo]="connectedDropLists()"
            (cdkDropListDropped)="onDrop($event, section.id)"
            class="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
          >
            @for (task of getTasksForSection(section.id); track task.id) {
            <div
              cdkDrag
              [cdkDragData]="task"
              class="ofx-task-card bg-slate-800 p-4 rounded-lg border border-white/5 shadow-sm hover:shadow-lg hover:border-cyan-500/30 transition-all cursor-pointer group relative overflow-hidden"
              (click)="taskClick.emit(task)"
            >
              <!-- Drag Handle (invisible but essentially the whole card) -->
              <div
                *cdkDragPlaceholder
                class="bg-slate-800/30 border-2 border-dashed border-slate-600 rounded-lg h-24 w-full"
              ></div>

              <!-- Priority Indicator -->
              <div
                class="absolute top-0 right-0 w-2 h-2 m-2 rounded-full"
                [ngClass]="{
                  'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]': task.priority === 'high',
                  'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]': task.priority === 'medium',
                  'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]': task.priority === 'low'
                }"
              ></div>

              <h4 class="text-sm font-medium text-slate-100 mb-2 pr-4 leading-normal">
                {{ task.title }}
                @if (task.googleTaskId) {
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="inline-block h-4 w-4 ml-2 text-blue-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
                }
              </h4>

              <div class="flex items-center justify-between mt-3">
                <div class="flex items-center gap-2">
                  @if (task.assigneeName) {
                  <div
                    class="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center text-[10px] uppercase font-bold"
                  >
                    {{ task.assigneeName.substring(0, 2) }}
                  </div>
                  } @if (task.dueDate) {
                  <div
                    class="flex items-center gap-1 text-[11px]"
                    [class.text-rose-400]="isOverdue(task)"
                    [class.text-slate-400]="!isOverdue(task)"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    {{ formatDate(task.dueDate) }}
                  </div>
                  }
                </div>
              </div>
            </div>
            }

            <!-- Add Task Button -->
            <button
              class="w-full py-2 rounded-lg border border-dashed border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 hover:bg-white/5 transition-all text-sm flex items-center justify-center gap-2"
              (click)="quickAdd.emit(section.id)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add Task
            </button>
          </div>
        </div>
        }

        <!-- Add Section Button -->
        <div class="add-section-btn flex-shrink-0">
          <button
            class="w-full h-full min-h-[8rem] bg-slate-900/40 border border-white/5 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all flex flex-col items-center justify-center gap-2 font-medium"
            (click)="addSection.emit()"
            title="Add Section"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      /* Board column sizing - using rem for accessibility and scalability */
      :host {
        --board-column-width: 22rem; /* ~352px at 16px root, good desktop size */
        --board-column-min-width: 18rem; /* ~288px minimum for readability */
        --add-section-width: 3.5rem; /* Narrow add section button */
      }

      /* Responsive adjustments for smaller screens */
      @media (max-width: 768px) {
        :host {
          --board-column-width: 85vw; /* Nearly full width on mobile */
          --board-column-min-width: 16rem;
        }
      }

      .board-column {
        width: var(--board-column-width);
        min-width: var(--board-column-min-width);
      }

      .add-section-btn {
        width: var(--add-section-width);
        min-width: var(--add-section-width);
      }

      .ofx-task-card:active {
        cursor: grabbing;
      }

      /* Custom scrollbar for columns */
      .scrollbar-thin::-webkit-scrollbar {
        width: 6px;
      }
      .scrollbar-thin::-webkit-scrollbar-track {
        background: transparent;
      }
      .scrollbar-thin::-webkit-scrollbar-thumb {
        background-color: rgba(148, 163, 184, 0.2);
        border-radius: 3px;
      }
      .scrollbar-thin::-webkit-scrollbar-thumb:hover {
        background-color: rgba(148, 163, 184, 0.4);
      }
    `,
  ],
})
export class TaskBoardViewComponent {
  private taskService = inject(TaskService);
  private projectService = inject(ProjectService);

  // Inputs
  tasks = input.required<Task[]>();
  project = input.required<Project>();

  // Outputs
  taskClick = output<Task>();
  quickAdd = output<string>(); // sectionId
  addSection = output<void>();

  // Computed: Get all section IDs for drag-drop connection
  connectedDropLists = computed(() => this.project().sections.map((s) => s.id));

  projectSections = computed(() => this.project().sections.sort((a, b) => a.order - b.order));

  getTasksForSection(sectionId: string) {
    // Filter tasks for this section and sort by order
    // If tasks don't have a sectionId (e.g., from List view creation),
    // we might want to assign them to the first section or a 'No Section' area.
    // For now, valid sectionId is assumed or handled by default assignment.

    // Note: Creating a computed here for *each* section might be expensive if not careful,
    // but Angular signals are efficient. However, `getTasksForSection` is a method called in template loop.
    // Better to pre-compute strict groups?
    // Optimization: Pre-group tasks in a computed signal map.

    return this.tasks()
      .filter((t) => t.sectionId === sectionId)
      .sort((a, b) => a.order - b.order);
  }

  onDrop(event: CdkDragDrop<Task[]>, targetSectionId: string) {
    if (event.previousContainer === event.container) {
      // Reorder within the same column
      const task = event.item.data as Task;
      // We don't need to actually mutate the array in UI immediately if we rely on backend,
      // but for smooth UX we should.
      // However, `event.container.data` is a read-only View/Filter of the source array in this architecture,
      // so `moveItemInArray` might not modify the master `tasks` list correctly if we just pass the filtered list.
      // We need to implement reorder via service.

      // Calculate new order
      // Simple logic: average of prev and next item orders, or re-index entire list.
      // We'll let the service handle re-indexing.

      this.reorderTask(
        task.id,
        event.currentIndex,
        targetSectionId,
        event.container.data // The tasks in this section
      );
    } else {
      // Moving between columns
      const task = event.item.data as Task;
      // Calculate new order in target section
      this.reorderTask(
        task.id,
        event.currentIndex,
        targetSectionId,
        event.container.data // tasks in target section
      );
    }
  }

  private reorderTask(taskId: string, newIndex: number, sectionId: string, siblingTasks: Task[]) {
    // Build the complete reordered list with proper indices for ALL tasks in the section
    // This ensures no order collisions occur after drag-drop operations
    
    // Get the moved task (may not be in siblingTasks if transferring between columns)
    const movedTask = siblingTasks.find(t => t.id === taskId);
    
    // Remove the moved task from its current position (if present)
    const tasksWithoutMoved = siblingTasks.filter(t => t.id !== taskId);
    
    // Build the new ordered list by inserting at the target index
    const reorderedList: { id: string }[] = [
      ...tasksWithoutMoved.slice(0, newIndex),
      { id: taskId }, // Insert moved task at new position
      ...tasksWithoutMoved.slice(newIndex)
    ];
    
    // Update ALL tasks in the section with sequential order values
    // This prevents order collisions and ensures consistent ordering
    const updates = reorderedList.map((task, index) => ({
      id: task.id,
      order: index,
      sectionId,
    }));
    
    this.taskService.reorderTasks(updates);
  }

  formatDate(date: any): string {
    if (!date) return '';
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

  showColumnMenu(section: Section) {
    // Placeholder for column actions (Delete, Edit, Color)
    console.log('Column menu', section);
  }
}

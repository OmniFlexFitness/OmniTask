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
    <div class="h-full flex flex-col overflow-hidden">
      <!-- Filter Bar -->
      <div
        class="flex items-center justify-between px-4 py-2 bg-slate-900/60 border-b border-white/5 flex-shrink-0"
      >
        <div class="flex items-center gap-3">
          <span class="text-xs text-slate-400"> {{ visibleTaskCount() }} tasks </span>
          @if (hiddenCompletedCount() > 0) {
            <span class="text-xs text-slate-500">
              ({{ hiddenCompletedCount() }} completed hidden)
            </span>
          }
        </div>

        <!-- Completed Filter Toggle -->
        <button
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
          [class.bg-emerald-500/20]="showCompleted()"
          [class.text-emerald-400]="showCompleted()"
          [class.border-emerald-500/30]="showCompleted()"
          [class.bg-slate-800/50]="!showCompleted()"
          [class.text-slate-400]="!showCompleted()"
          [class.border-slate-600/30]="!showCompleted()"
          (click)="toggleShowCompleted()"
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
              d="M5 13l4 4L19 7"
            />
          </svg>
          {{ showCompleted() ? 'Showing Completed' : 'Hide Completed' }}
        </button>
      </div>

      <div class="flex-1 overflow-x-auto overflow-y-hidden">
        <div class="h-full flex gap-6 pb-4 min-w-max p-4">
          @for (section of projectSections(); track section.id) {
            <div
              class="board-column flex flex-col rounded-xl border h-full max-h-full transition-all duration-300"
              [class.bg-slate-900/40]="getSectionStatus(section) !== 'done'"
              [class.bg-slate-900/20]="getSectionStatus(section) === 'done'"
              [class.border-white/5]="getSectionStatus(section) === 'done'"
              [class.opacity-75]="getSectionStatus(section) === 'done'"
              [ngClass]="{
                'cyber-column-todo': getSectionStatus(section) === 'todo',
                'cyber-column-progress': getSectionStatus(section) === 'in-progress',
                'cyber-column-done': getSectionStatus(section) === 'done'
              }"
            >
              <!-- Column Header -->
              <div
                class="p-4 flex items-center justify-between border-b handle cursor-grab active:cursor-grabbing relative overflow-hidden"
                [class.border-white/10]="getSectionStatus(section) === 'done'"
                [class.border-white/10]="getSectionStatus(section) !== 'done'"
              >
                <!-- Neon glow effect for active columns -->
                @if (getSectionStatus(section) !== 'done') {
                  <div
                    class="absolute inset-0 opacity-10 pointer-events-none"
                    [style.background]="'linear-gradient(135deg, ' + getColorWithOpacity(section.color, 0.2) + ', transparent)'"
                  ></div>
                }
                
                <div class="flex items-center gap-3 relative z-10">
                  <span
                    class="w-3 h-3 rounded-full transition-all duration-300"
                    [style.background]="section.color || '#64748b'"
                    [style.box-shadow]="getSectionStatus(section) !== 'done' ? '0 0 12px ' + getColorWithOpacity(section.color, 0.5) + ', 0 0 20px ' + getColorWithOpacity(section.color, 0.25) : 'none'"
                    [class.animate-pulse]="getSectionStatus(section) === 'in-progress'"
                  ></span>
                  <h3 
                    class="font-bold text-sm tracking-wide transition-colors duration-300"
                    [class.text-slate-200]="getSectionStatus(section) !== 'done'"
                    [class.text-slate-500]="getSectionStatus(section) === 'done'"
                    [style.text-shadow]="getSectionStatus(section) !== 'done' ? '0 0 8px ' + getColorWithOpacity(section.color, 0.6) : 'none'"
                  >
                    {{ section.name }}
                  </h3>
                  <span 
                    class="text-xs px-2 py-0.5 rounded-full transition-colors duration-300"
                    [class.bg-white/5]="getSectionStatus(section) === 'done'"
                    [class.text-slate-500]="getSectionStatus(section) === 'done'"
                    [class.text-slate-400]="getSectionStatus(section) !== 'done'"
                    [style.background]="getSectionStatus(section) !== 'done' ? getColorWithOpacity(section.color, 0.2) : ''"
                    [style.color]="getSectionStatus(section) !== 'done' ? (section.color || '#64748b') : ''"
                    [style.border]="getSectionStatus(section) !== 'done' ? '1px solid ' + getColorWithOpacity(section.color, 0.25) : ''"
                  >
                    {{ getFilteredTasksForSection(section.id).length }}
                  </span>
                </div>
                <button
                  class="text-slate-500 hover:text-white transition-colors relative z-10"
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
                @for (task of getFilteredTasksForSection(section.id); track task.id) {
                  <div
                    cdkDrag
                    [cdkDragData]="task"
                    class="ofx-task-card p-4 rounded-lg border shadow-sm transition-all cursor-pointer group relative overflow-hidden"
                    [class.bg-slate-800]="task.status !== 'done'"
                    [class.bg-slate-900/30]="task.status === 'done'"
                    [class.border-white/5]="task.status === 'done'"
                    [class.opacity-50]="task.status === 'done'"
                    [class.grayscale]="task.status === 'done'"
                    [class.hover:shadow-lg]="task.status !== 'done'"
                    [ngClass]="{
                      'task-todo': getSectionStatus(section) === 'todo' && task.status !== 'done',
                      'task-progress': getSectionStatus(section) === 'in-progress' && task.status !== 'done',
                      'task-done': task.status === 'done'
                    }"
                    [style.border-color]="task.status !== 'done' ? getColorWithOpacity(section.color, 0.3) : ''"
                    (click)="taskClick.emit(task)"
                  >
                    <!-- Neon glow effect for active tasks -->
                    @if (task.status !== 'done') {
                      <div
                        class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                        [style.background]="'linear-gradient(135deg, ' + getColorWithOpacity(section.color, 0.1) + ', transparent)'"
                        [style.box-shadow]="'0 0 20px ' + getColorWithOpacity(section.color, 0.2) + ', inset 0 0 20px ' + getColorWithOpacity(section.color, 0.1)"
                      ></div>
                    }
                    
                    <!-- Scanline effect for done tasks -->
                    @if (task.status === 'done') {
                      <div class="absolute inset-0 scanline-overlay pointer-events-none"></div>
                    }
                    
                    <!-- Drag Handle (invisible but essentially the whole card) -->
                    <div
                      *cdkDragPlaceholder
                      class="bg-slate-800/30 border-2 border-dashed rounded-lg h-24 w-full"
                      [style.border-color]="section.color || '#64748b'"
                    ></div>

                    <!-- Priority Indicator -->
                    <div
                      class="absolute top-0 right-0 w-2 h-2 m-2 rounded-full transition-all duration-300"
                      [ngClass]="{
                        'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]':
                          task.priority === 'high' && task.status !== 'done',
                        'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]':
                          task.priority === 'medium' && task.status !== 'done',
                        'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]':
                          task.priority === 'low' && task.status !== 'done',
                        'bg-slate-600': task.status === 'done'
                      }"
                    ></div>

                    <h4
                      class="text-sm font-medium mb-2 pr-4 leading-normal relative z-10 transition-all duration-300"
                      [class.text-slate-100]="task.status !== 'done'"
                      [class.text-slate-500]="task.status === 'done'"
                      [class.line-through]="task.status === 'done'"
                      [style.text-shadow]="task.status !== 'done' ? '0 0 4px ' + getColorWithOpacity(section.color, 0.2) : 'none'"
                    >
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

                    <div class="flex items-center justify-between mt-3 relative z-10">
                      <div class="flex items-center gap-2">
                        @if (task.assigneeName) {
                          <div
                            class="w-6 h-6 rounded-full text-indigo-300 border flex items-center justify-center text-[10px] uppercase font-bold transition-all duration-300"
                            [class.bg-indigo-500/20]="task.status !== 'done'"
                            [class.border-indigo-500/30]="task.status !== 'done'"
                            [class.bg-slate-700/20]="task.status === 'done'"
                            [class.border-slate-600/30]="task.status === 'done'"
                            [class.text-slate-500]="task.status === 'done'"
                          >
                            {{ task.assigneeName.substring(0, 2) }}
                          </div>
                        }
                        @if (task.dueDate) {
                          <div
                            class="flex items-center gap-1 text-[11px] transition-colors duration-300"
                            [class.text-rose-400]="isOverdue(task) && task.status !== 'done'"
                            [class.text-slate-400]="!isOverdue(task) && task.status !== 'done'"
                            [class.text-slate-600]="task.status === 'done'"
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
    </div>
  `,
  styles: [
    `
      /* Board column sizing - using rem for accessibility and scalability */
      :host {
        --board-column-width: 22rem; /* ~352px at 16px root, good desktop size */
        --board-column-min-width: 18rem; /* ~288px minimum for readability */
        --add-section-width: 3.5rem; /* Narrow add section button */
        
        /* Cyberpunk color variables */
        --cyber-purple: #e040fb;
        --cyber-blue: #00d2ff;
        --cyber-gray: #6b7280;
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

      /* Cyberpunk column styles */
      .cyber-column-todo {
        border: 1px solid rgba(224, 64, 251, 0.2);
        box-shadow: 
          0 0 20px rgba(224, 64, 251, 0.1),
          inset 0 0 20px rgba(224, 64, 251, 0.05);
      }
      
      .cyber-column-progress {
        border: 1px solid rgba(0, 210, 255, 0.2);
        box-shadow: 
          0 0 20px rgba(0, 210, 255, 0.1),
          inset 0 0 20px rgba(0, 210, 255, 0.05);
        animation: pulse-progress 3s ease-in-out infinite;
      }
      
      .cyber-column-done {
        position: relative;
      }
      
      .cyber-column-done::before {
        content: '';
        position: absolute;
        inset: 0;
        background: repeating-linear-gradient(
          0deg,
          rgba(0, 0, 0, 0.1) 0px,
          transparent 1px,
          transparent 2px,
          rgba(0, 0, 0, 0.1) 3px
        );
        pointer-events: none;
        opacity: 0.3;
      }

      /* Task card styles */
      .task-todo {
        border: 1px solid rgba(224, 64, 251, 0.3);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transition: all 0.3s ease;
      }
      
      .task-todo:hover {
        border-color: rgba(224, 64, 251, 0.6);
        box-shadow: 
          0 8px 24px rgba(0, 0, 0, 0.4),
          0 0 20px rgba(224, 64, 251, 0.3);
        transform: translateY(-2px);
      }
      
      .task-progress {
        border: 1px solid rgba(0, 210, 255, 0.3);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transition: all 0.3s ease;
      }
      
      .task-progress:hover {
        border-color: rgba(0, 210, 255, 0.6);
        box-shadow: 
          0 8px 24px rgba(0, 0, 0, 0.4),
          0 0 20px rgba(0, 210, 255, 0.3);
        transform: translateY(-2px);
      }
      
      .task-done {
        position: relative;
        filter: grayscale(70%);
        transition: all 0.3s ease;
      }
      
      .task-done:hover {
        filter: grayscale(50%);
        opacity: 0.7 !important;
      }

      /* Scanline overlay for done tasks */
      .scanline-overlay {
        background: repeating-linear-gradient(
          0deg,
          rgba(0, 0, 0, 0.15) 0px,
          transparent 1px,
          transparent 2px,
          rgba(0, 0, 0, 0.15) 3px
        );
        animation: scanline 8s linear infinite;
      }
      
      @keyframes scanline {
        0% {
          transform: translateY(0);
        }
        100% {
          transform: translateY(100%);
        }
      }
      
      @keyframes pulse-progress {
        0%, 100% {
          box-shadow: 
            0 0 20px rgba(0, 210, 255, 0.1),
            inset 0 0 20px rgba(0, 210, 255, 0.05);
        }
        50% {
          box-shadow: 
            0 0 30px rgba(0, 210, 255, 0.2),
            inset 0 0 30px rgba(0, 210, 255, 0.1);
        }
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
  private readonly taskService = inject(TaskService);
  private readonly projectService = inject(ProjectService);

  // Inputs
  tasks = input.required<Task[]>();
  project = input.required<Project>();

  // Outputs
  taskClick = output<Task>();
  quickAdd = output<string>(); // sectionId
  addSection = output<void>();

  // Filter state - hide completed tasks older than 30 minutes by default
  showCompleted = signal(false);

  // Track session start time to show recently completed tasks
  private sessionStartTime = new Date();

  // Computed: Get all section IDs for drag-drop connection
  connectedDropLists = computed(() => this.project().sections.map((s) => s.id));

  projectSections = computed(() => this.project().sections.sort((a, b) => a.order - b.order));

  // Count visible tasks
  visibleTaskCount = computed(() => {
    let count = 0;
    for (const section of this.projectSections()) {
      count += this.getFilteredTasksForSection(section.id).length;
    }
    return count;
  });

  // Count hidden completed tasks
  hiddenCompletedCount = computed(() => {
    return this.tasks().length - this.visibleTaskCount();
  });

  toggleShowCompleted() {
    this.showCompleted.update((v) => !v);
  }

  private toDate(dateValue: unknown): Date {
    if (dateValue instanceof Date) return dateValue;
    if (dateValue && typeof dateValue === 'object' && 'toDate' in dateValue) {
      return (dateValue as { toDate: () => Date }).toDate();
    }
    return new Date(dateValue as string | number);
  }

  getTasksForSection(sectionId: string) {
    // Filter tasks for this section and sort by order
    return this.tasks()
      .filter((t) => t.sectionId === sectionId)
      .sort((a, b) => a.order - b.order);
  }

  getFilteredTasksForSection(sectionId: string) {
    const sectionTasks = this.getTasksForSection(sectionId);

    if (this.showCompleted()) {
      return sectionTasks; // Show all tasks
    }

    const now = new Date();
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    return sectionTasks.filter((task) => {
      if (task.status !== 'done') return true; // Always show non-completed tasks

      // Show recently completed tasks (within 30 min or completed during this session)
      if (task.completedAt) {
        const completedAt = this.toDate(task.completedAt);
        return completedAt > thirtyMinutesAgo || completedAt > this.sessionStartTime;
      }

      // If no completedAt, check updatedAt
      if (task.updatedAt) {
        const updatedAt = this.toDate(task.updatedAt);
        return updatedAt > thirtyMinutesAgo;
      }

      return false; // Hide old completed tasks
    });
  }

  onDrop(event: CdkDragDrop<Task[]>, targetSectionId: string) {
    if (event.previousContainer === event.container) {
      // Reorder within the same column
      const task = event.item.data as Task;
      this.reorderTask(task.id, event.currentIndex, targetSectionId, event.container.data);
    } else {
      // Moving between columns
      const task = event.item.data as Task;
      this.reorderTask(task.id, event.currentIndex, targetSectionId, event.container.data);
    }
  }

  private reorderTask(taskId: string, newIndex: number, sectionId: string, siblingTasks: Task[]) {
    // Build the complete reordered list with proper indices for ALL tasks in the section
    // This ensures no order collisions occur after drag-drop operations

    // Remove the moved task from its current position (if present)
    const tasksWithoutMoved = siblingTasks.filter((t) => t.id !== taskId);

    // Build the new ordered list by inserting at the target index
    const reorderedList: { id: string }[] = [
      ...tasksWithoutMoved.slice(0, newIndex),
      { id: taskId }, // Insert moved task at new position
      ...tasksWithoutMoved.slice(newIndex),
    ];

    // Update ALL tasks in the section with sequential order values.
    // The service's reorderTasks will derive status from the target sectionId
    // via the section's status mapping — no manual status logic needed here.
    const updates = reorderedList.map((task, index) => ({
      id: task.id,
      order: index,
      sectionId,
    }));

    this.taskService.reorderTasks(updates);
  }

  formatDate(date: unknown): string {
    if (!date) return '';
    const d = this.toDate(date);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  isOverdue(task: Task): boolean {
    if (task.status === 'done' || !task.dueDate) return false;
    const due = this.toDate(task.dueDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return due < now;
  }

  showColumnMenu(section: Section) {
    // Placeholder for column actions (Delete, Edit, Color)
    console.log('Column menu', section);
  }

  /**
   * Get the status for a section, with fallback logic for sections created before status field was added
   */
  getSectionStatus(section: Section): 'todo' | 'in-progress' | 'done' {
    // If section has explicit status, use it
    if (section.status) {
      return section.status;
    }
    
    // Otherwise, infer from section name or color
    const nameLower = section.name.toLowerCase();
    if (nameLower.includes('done') || nameLower.includes('complete')) {
      return 'done';
    }
    if (nameLower.includes('progress') || nameLower.includes('doing')) {
      return 'in-progress';
    }
    return 'todo'; // default
  }

  /**
   * Convert hex color to rgba with alpha
   */
  hexToRgba(hex: string, alpha: number): string {
    // Remove # if present
    const cleanHex = hex.replace(/^#/, '');
    
    // Validate and expand short hex codes (e.g., #fff -> #ffffff)
    let fullHex = cleanHex;
    if (cleanHex.length === 3) {
      fullHex = cleanHex
        .split('')
        .map((char) => char + char)
        .join('');
    } else if (cleanHex.length !== 6) {
      // Invalid hex format, return default gray
      return `rgba(100, 116, 139, ${alpha})`; // #64748b
    }
    
    // Parse hex to RGB
    const r = parseInt(fullHex.substring(0, 2), 16);
    const g = parseInt(fullHex.substring(2, 4), 16);
    const b = parseInt(fullHex.substring(4, 6), 16);
    
    // Validate parsed values
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
      return `rgba(100, 116, 139, ${alpha})`; // #64748b fallback
    }
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Get color with opacity for dynamic styles
   */
  getColorWithOpacity(color: string | undefined, opacity: number): string {
    const baseColor = color || '#64748b';
    return this.hexToRgba(baseColor, opacity);
  }
}

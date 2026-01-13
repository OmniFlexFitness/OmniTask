import { Component, computed, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';

import { ProjectService } from '../../core/services/project.service';
import { TaskService } from '../../core/services/task.service';
import { Project, Task, TaskViewMode } from '../../core/models/domain.model';

import { ProjectStatsCardComponent } from './components/project-stats-card.component';
import { ProjectSettingsPanelComponent } from './components/project-settings-panel.component';
import { TaskListViewComponent } from '../tasks/task-list-view.component';
import { TaskBoardViewComponent } from '../tasks/task-board-view.component';
import { TaskCalendarViewComponent } from '../tasks/task-calendar-view.component';
import { TaskDetailModalComponent } from '../tasks/task-detail-modal.component';
import { TaskCreateModalComponent } from '../tasks/task-create-modal.component';

type ProjectTab = 'overview' | 'tasks' | 'settings';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [
    CommonModule,
    ProjectStatsCardComponent,
    ProjectSettingsPanelComponent,
    TaskListViewComponent,
    TaskBoardViewComponent,
    TaskCalendarViewComponent,
    TaskDetailModalComponent,
    TaskCreateModalComponent,
  ],
  template: `
    <div class="h-screen flex flex-col bg-[#050810] text-slate-200">
      @if (project(); as project) {
        <!-- Header -->
        <header class="flex-shrink-0 bg-slate-900/50 backdrop-blur-md border-b border-white/5 z-20 relative">
           <!-- Top glow line -->
          <div class="absolute top-0 left-0 right-0 h-px bg-cyan-500/30"></div>
          
          <div class="px-6 py-4">
            <!-- Breadcrumbs / Back -->
            <button 
              (click)="goBack()" 
              class="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-cyan-400 mb-3 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Projects
            </button>
            
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-4">
                <!-- Icon/Color Box -->
                <div 
                  class="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg"
                  [style.background]="'linear-gradient(135deg, ' + (project.color || '#6366f1') + '20, ' + (project.color || '#6366f1') + '05)'"
                  [style.border]="'1px solid ' + (project.color || '#6366f1') + '40'"
                  [style.box-shadow]="'0 0 20px ' + (project.color || '#6366f1') + '15'"
                >
                  <span class="text-2xl font-bold" [style.color]="project.color || '#6366f1'">
                    {{ project.name.charAt(0).toUpperCase() }}
                  </span>
                </div>
                
                <div>
                  <h1 class="text-2xl font-bold text-white flex items-center gap-3">
                    {{ project.name }}
                    @if (project.status === 'archived') {
                      <span class="px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider bg-amber-500/20 text-amber-500 rounded-full border border-amber-500/20">
                        Archived
                      </span>
                    }
                  </h1>
                  <p class="text-sm text-slate-400 max-w-2xl line-clamp-1">
                    {{ project.description || 'No description provided.' }}
                  </p>
                </div>
              </div>

              <!-- Primary Actions can go here -->
            </div>
            
            <!-- Navigation Tabs -->
            <div class="flex items-center gap-6 mt-6 border-b border-white/5">
              <button
                class="pb-3 text-sm font-medium transition-all relative"
                [class.text-cyan-400]="activeTab() === 'overview'"
                [class.text-slate-400]="activeTab() !== 'overview'"
                [class.hover:text-slate-200]="activeTab() !== 'overview'"
                (click)="updateTab('overview')"
              >
                Overview
                @if (activeTab() === 'overview') {
                  <span class="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)] rounded-full"></span>
                }
              </button>
              
              <button
                class="pb-3 text-sm font-medium transition-all relative"
                [class.text-cyan-400]="activeTab() === 'tasks'"
                [class.text-slate-400]="activeTab() !== 'tasks'"
                [class.hover:text-slate-200]="activeTab() !== 'tasks'"
                (click)="updateTab('tasks')"
              >
                Tasks
                @if (activeTab() === 'tasks') {
                  <span class="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)] rounded-full"></span>
                }
              </button>
              
              <button
                class="pb-3 text-sm font-medium transition-all relative"
                [class.text-cyan-400]="activeTab() === 'settings'"
                [class.text-slate-400]="activeTab() !== 'settings'"
                [class.hover:text-slate-200]="activeTab() !== 'settings'"
                (click)="updateTab('settings')"
              >
                Settings
                @if (activeTab() === 'settings') {
                  <span class="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)] rounded-full"></span>
                }
              </button>
            </div>
          </div>
        </header>

        <!-- Main Content -->
        <main class="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          @switch (activeTab()) {
            @case ('overview') {
              <div class="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <!-- Stats -->
                <section>
                  <h2 class="text-lg font-semibold text-white mb-4">Project Status</h2>
                  <app-project-stats-card [tasks]="tasks()"></app-project-stats-card>
                </section>
                
                <!-- Recent Activity / Info -->
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div class="lg:col-span-2 space-y-6">
                    <!-- Description Card -->
                     <section class="bg-slate-900/50 rounded-xl border border-white/5 p-6">
                      <h3 class="text-sm font-semibold text-slate-200 mb-3">About this project</h3>
                      @if (project.description) {
                         <p class="text-slate-400 leading-relaxed">{{ project.description }}</p>
                      } @else {
                        <p class="text-slate-500 italic">No description added yet.</p>
                      }
                      
                      <div class="mt-6 flex flex-wrap gap-2">
                         @for (tag of project.tags; track tag.id) {
                           <span 
                             class="px-2.5 py-1 rounded-full text-xs font-medium border"
                             [style.background-color]="tag.color + '10'"
                             [style.color]="tag.color"
                             [style.border-color]="tag.color + '30'"
                           >
                             {{ tag.name }}
                           </span>
                         }
                      </div>
                    </section>
                  </div>
                  
                  <div class="space-y-6">
                    <!-- Mini Team Card -->
                    <section class="bg-slate-900/50 rounded-xl border border-white/5 p-6">
                      <h3 class="text-sm font-semibold text-slate-200 mb-3">Team</h3>
                      <div class="flex -space-x-2 overflow-hidden py-1">
                         <!-- Placeholder since we don't have user profiles yet -->
                         <div class="inline-block h-8 w-8 rounded-full ring-2 ring-slate-900 bg-cyan-500/20 flex items-center justify-center text-xs font-bold text-cyan-400">
                           {{ project.ownerId.charAt(0).toUpperCase() || 'U' }}
                         </div>
                         @if ((project.memberIds.length || 0) > 1) {
                           <div class="inline-block h-8 w-8 rounded-full ring-2 ring-slate-900 bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                             +{{ (project.memberIds.length || 1) - 1 }}
                           </div>
                         }
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            }
            
            @case ('tasks') {
              <div class="h-full flex flex-col animate-in fade-in zoom-in-95 duration-300">
                <!-- Task View Controls -->
                <div class="flex items-center justify-between mb-4 flex-shrink-0">
                  <div class="flex bg-slate-900 p-1 rounded-lg border border-white/10">
                    <button 
                      class="px-4 py-1.5 rounded-md text-sm font-medium transition-all"
                      [class.bg-white/10]="taskViewMode() === 'list'"
                      [class.text-white]="taskViewMode() === 'list'"
                      [class.text-slate-500]="taskViewMode() !== 'list'"
                      (click)="taskViewMode.set('list')"
                    >
                       List
                    </button>
                    <button 
                      class="px-4 py-1.5 rounded-md text-sm font-medium transition-all"
                      [class.bg-white/10]="taskViewMode() === 'board'"
                      [class.text-white]="taskViewMode() === 'board'"
                      [class.text-slate-500]="taskViewMode() !== 'board'"
                      (click)="taskViewMode.set('board')"
                    >
                       Board
                    </button>
                    <button 
                      class="px-4 py-1.5 rounded-md text-sm font-medium transition-all"
                      [class.bg-white/10]="taskViewMode() === 'calendar'"
                      [class.text-white]="taskViewMode() === 'calendar'"
                      [class.text-slate-500]="taskViewMode() !== 'calendar'"
                      (click)="taskViewMode.set('calendar')"
                    >
                       Calendar
                    </button>
                  </div>
                  
                  <button 
                   class="ofx-neon-button text-sm px-4 py-2"
                   (click)="openCreateTaskModal()"
                  >
                    + Add Task
                  </button>
                </div>
                
                <!-- Task View Content -->
                <div class="flex-1 min-h-0 bg-slate-900/30 rounded-xl border border-white/5 overflow-hidden relative">
                   @switch (taskViewMode()) {
                     @case ('list') {
                       <app-task-list-view
                         [tasks]="tasks()"
                         (taskClick)="openTaskDetail($event)"
                         (delete)="deleteTask($event)"
                       ></app-task-list-view>
                     }
                     @case ('board') {
                       <app-task-board-view
                         [tasks]="tasks()"
                         [project]="project"
                         (taskClick)="openTaskDetail($event)"
                         (quickAdd)="quickAddInBoard($event)"
                         (addSection)="activeTab.set('settings')"
                       ></app-task-board-view>
                     }
                     @case ('calendar') {
                       <app-task-calendar-view
                         [tasks]="tasks()"
                         (taskClick)="openTaskDetail($event)"
                         (addTaskForDate)="addTaskForDate($event)"
                       ></app-task-calendar-view>
                     }
                   }
                </div>
              </div>
            }
            
            @case ('settings') {
              <div class="max-w-4xl mx-auto pb-12 animate-in slide-in-from-right-4 duration-300">
                <div class="bg-slate-900/80 backdrop-blur-sm rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
                  <div class="p-8">
                     <h2 class="text-xl font-bold text-white mb-6">Project Settings</h2>
                     <app-project-settings-panel
                       [project]="project"
                       (projectChanged)="onProjectUpdated()"
                       (projectDeleted)="onProjectDeleted()"
                     ></app-project-settings-panel>
                  </div>
                </div>
              </div>
            }
          }
        </main>
      } @else {
        <!-- Loading State -->
        <div class="h-full flex items-center justify-center">
          <div class="flex flex-col items-center gap-4">
             <div class="w-12 h-12 rounded-full border-4 border-slate-700 border-t-cyan-500 animate-spin"></div>
             <p class="text-slate-400 animate-pulse">Loading project...</p>
          </div>
        </div>
      }
      
      <!-- Modals -->
       @if (openTask()) {
        <app-task-detail-modal
          [task]="openTask()"
          [projectId]="project()?.id ?? null"
          (close)="openTask.set(null)"
          (updated)="onTaskUpdated()"
          (deleted)="onTaskDeleted()"
        ></app-task-detail-modal>
      }

      @if (showCreateModal()) {
        <app-task-create-modal
          [projectId]="project()!.id"
          [initialSectionId]="createModalSectionId()"
          [initialDueDate]="createModalDueDate()"
          (close)="closeCreateModal()"
          (created)="onTaskCreated()"
        ></app-task-create-modal>
      }
    </div>
  `,
  styles: [
    `
      /* Scrollbar styling */
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }

      ::-webkit-scrollbar-track {
        background: transparent;
      }

      ::-webkit-scrollbar-thumb {
        background: rgba(148, 163, 184, 0.2);
        border-radius: 4px;
      }

      ::-webkit-scrollbar-thumb:hover {
        background: rgba(148, 163, 184, 0.4);
      }
    `,
  ],
})
export class ProjectDetailComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private projectService = inject(ProjectService);
  private taskService = inject(TaskService);

  // Tab State
  activeTab = signal<ProjectTab>('overview');
  taskViewMode = signal<TaskViewMode>('list');

  // ID from route
  projectId = toSignal(this.route.paramMap.pipe(switchMap((params) => of(params.get('id')))));

  // Data
  project = toSignal(
    this.projectId()
      ? this.route.paramMap.pipe(
          switchMap((params) => this.projectService.getProject$(params.get('id')!))
        )
      : of(null)
  );

  tasks = toSignal(
    this.projectId()
      ? this.route.paramMap.pipe(
          switchMap((params) => this.taskService.getTasksByProject(params.get('id')!))
        )
      : of([]),
    { initialValue: [] }
  );

  // Modal State
  openTask = signal<Task | null>(null);
  showCreateModal = signal(false);
  createModalSectionId = signal<string | null>(null);
  createModalDueDate = signal<Date | null>(null);

  // Reactive query params
  queryParams = toSignal(this.route.queryParamMap);

  constructor() {
    // Sync tab state with URL query params
    effect(() => {
      const params = this.queryParams();
      const tab = params?.get('tab');
      if (tab && (tab === 'overview' || tab === 'tasks' || tab === 'settings')) {
        this.activeTab.set(tab as ProjectTab);
      }
    });

    // Update global selected project ID when viewing this page
    effect(() => {
      const id = this.projectId();
      if (id) {
        this.projectService.selectedProjectId.set(id);
      }
    });
  }

  goBack() {
    this.router.navigate(['/projects']);
  }

  updateTab(tab: ProjectTab) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
    });
  }

  // Task Actions
  openTaskDetail(task: Task) {
    this.openTask.set(task);
  }

  openCreateTaskModal() {
    this.showCreateModal.set(true);
  }

  closeCreateModal() {
    this.showCreateModal.set(false);
    this.createModalSectionId.set(null);
    this.createModalDueDate.set(null);
  }

  quickAddInBoard(sectionId: string) {
    this.createModalSectionId.set(sectionId);
    this.showCreateModal.set(true);
  }

  addTaskForDate(date: Date) {
    this.createModalDueDate.set(date);
    this.showCreateModal.set(true);
  }

  async deleteTask(taskId: string) {
    if (confirm('Are you sure you want to delete this task?')) {
      await this.taskService.deleteTask(taskId);
    }
  }

  // Event Handlers
  onProjectUpdated() {
    // Firestore subscription handles data updates
    console.log('Project updated');
  }

  onProjectDeleted() {
    this.router.navigate(['/projects']);
  }

  onTaskCreated() {
    // Close modal handled by component
    // Data updates via subscription
  }

  onTaskUpdated() {
    // Data updates via subscription
  }

  onTaskDeleted() {
    this.openTask.set(null);
  }
}

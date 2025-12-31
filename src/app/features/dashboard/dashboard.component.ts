import { Component, computed, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';

import { TaskService } from '../../core/services/task.service';
import { ProjectService } from '../../core/services/project.service';
import { AuthService } from '../../core/auth/auth.service';
import { Project, Task, TaskViewMode } from '../../core/models/domain.model';

import { ProjectSidebarComponent } from '../projects/project-sidebar.component';
import { ProjectFormModalComponent } from '../projects/project-form-modal.component';
import { TaskListViewComponent } from '../tasks/task-list-view.component';
import { TaskBoardViewComponent } from '../tasks/task-board-view.component';
import { TaskCalendarViewComponent } from '../tasks/task-calendar-view.component';
import { TaskDetailModalComponent } from '../tasks/task-detail-modal.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    ProjectSidebarComponent,
    ProjectFormModalComponent,
    TaskListViewComponent,
    TaskBoardViewComponent,
    TaskCalendarViewComponent,
    TaskDetailModalComponent
  ],
  template: `
    <div class="h-screen flex overflow-hidden bg-slate-950">
      <!-- Sidebar -->
      <div class="w-64 flex-shrink-0 z-20">
        <app-project-sidebar
          [selectedProjectId]="selectedProjectId()"
          (projectSelected)="onProjectSelect($event)"
        ></app-project-sidebar>
      </div>

      <!-- Main Content -->
      <div class="flex-1 flex flex-col min-w-0 bg-slate-900/50 relative">
        <!-- Background accents -->
        <div class="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div class="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-3xl"></div>
          <div class="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-3xl"></div>
        </div>
        
        <!-- Header -->
        <header class="flex-shrink-0 border-b border-white/5 bg-slate-900/80 backdrop-blur-md z-10">
          <div class="px-6 py-4 flex items-center justify-between">
            <div class="flex items-center gap-4">
               @if (currentProject(); as project) {
                 <div>
                   <h1 class="text-xl font-bold text-white flex items-center gap-3">
                     <span 
                       class="w-3 h-3 rounded-sm shadow-[0_0_10px_currentColor]"
                       [style.background-color]="project.color || '#6366f1'"
                       [style.color]="project.color || '#6366f1'"
                     ></span>
                     {{ project.name }}
                   </h1>
                   <p class="text-xs text-slate-400 mt-1 truncate max-w-md">{{ project.description }}</p>
                 </div>
                 
                 <!-- Project Actions -->
                 <button 
                   class="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                   (click)="editProjectModal.set(project)"
                   title="Edit Project"
                 >
                   <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                   </svg>
                 </button>
               } @else {
                 <h1 class="text-xl font-bold text-slate-400">Select a project</h1>
               }
            </div>

            <!-- View Toggles & Actions -->
            <div class="flex items-center gap-4">
              <!-- View Switcher -->
              <div class="flex bg-slate-800 p-1 rounded-lg border border-white/5">
                <button 
                  class="px-3 py-1.5 rounded-md text-sm font-medium transition-all"
                  [class.bg-slate-700]="viewMode() === 'list'"
                  [class.text-white]="viewMode() === 'list'"
                  [class.shadow-sm]="viewMode() === 'list'"
                  [class.text-slate-400]="viewMode() !== 'list'"
                  [class.hover:text-white]="viewMode() !== 'list'"
                  (click)="viewMode.set('list')"
                >
                  List
                </button>
                <button 
                  class="px-3 py-1.5 rounded-md text-sm font-medium transition-all"
                  [class.bg-slate-700]="viewMode() === 'board'"
                  [class.text-white]="viewMode() === 'board'"
                  [class.shadow-sm]="viewMode() === 'board'"
                  [class.text-slate-400]="viewMode() !== 'board'"
                  [class.hover:text-white]="viewMode() !== 'board'"
                  (click)="viewMode.set('board')"
                >
                  Board
                </button>
                <button 
                  class="px-3 py-1.5 rounded-md text-sm font-medium transition-all"
                  [class.bg-slate-700]="viewMode() === 'calendar'"
                  [class.text-white]="viewMode() === 'calendar'"
                  [class.shadow-sm]="viewMode() === 'calendar'"
                  [class.text-slate-400]="viewMode() !== 'calendar'"
                  [class.hover:text-white]="viewMode() !== 'calendar'"
                  (click)="viewMode.set('calendar')"
                >
                   Calendar
                </button>
              </div>

              <!-- Add Task Button -->
              <button 
                class="ofx-gradient-button flex items-center gap-2"
                [disabled]="!currentProject()"
                (click)="openCreateTaskModal()"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Add Task
              </button>
              
              <!-- User Profile -->
               <div class="relative group">
                 <button class="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center justify-center font-bold">
                   {{ auth.currentUserSig()?.displayName?.charAt(0) }}
                 </button>
                 <div class="absolute right-0 mt-2 w-48 bg-slate-900 border border-white/10 rounded-xl shadow-xl py-2 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all z-50">
                   <div class="px-4 py-2 border-b border-white/5 mb-2">
                     <p class="text-sm font-medium text-white">{{ auth.currentUserSig()?.displayName }}</p>
                     <p class="text-xs text-slate-500 truncate">{{ auth.currentUserSig()?.email }}</p>
                   </div>
                   <button 
                     class="w-full text-left px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                     (click)="auth.logout()"
                   >
                     Sign Out
                   </button>
                 </div>
               </div>
            </div>
          </div>
        </header>

        <!-- View Content -->
        <main class="flex-1 overflow-hidden p-6 z-10">
          @if (!currentProject()) {
            <div class="h-full flex flex-col items-center justify-center text-slate-500">
               <div class="w-24 h-24 bg-slate-800/50 rounded-full flex items-center justify-center mb-6">
                 <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                 </svg>
               </div>
               <h2 class="text-xl font-bold text-white mb-2">No Project Selected</h2>
               <p class="max-w-md text-center">Select a project from the sidebar or create a new one to start managing your tasks.</p>
            </div>
          } @else {
            @switch (viewMode()) {
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
                  [project]="currentProject()!"
                  (taskClick)="openTaskDetail($event)"
                  (quickAdd)="quickAddInBoard($event)"
                  (addSection)="addSection()"
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
          }
        </main>
      </div>

      <!-- Modals -->
      @if (editProjectModal()) {
        <app-project-form-modal
          [editProject]="editProjectModal()"
          (close)="editProjectModal.set(null)"
          (saved)="onProjectSaved($event)"
        ></app-project-form-modal>
      }

      @if (openTask()) {
        <app-task-detail-modal
          [task]="openTask()"
          [projectId]="selectedProjectId()"
          (close)="openTask.set(null)"
          (updated)="onTaskUpdated($event)"
          (deleted)="onTaskDeleted($event)"
        ></app-task-detail-modal>
      }
    </div>
  `
})
export class DashboardComponent {
  auth = inject(AuthService);
  projectService = inject(ProjectService);
  taskService = inject(TaskService);
  router = inject(Router);

  // State
  selectedProjectId = this.projectService.selectedProjectId;
  viewMode = signal<TaskViewMode>('list');
  
  // Modals state
  editProjectModal = signal<Project | null>(null);
  openTask = signal<Task | null>(null);

  // Derived state for Current Project
  currentProject = toSignal(
    toObservable(this.selectedProjectId).pipe(
      switchMap(id => id ? this.projectService.getProject$(id) : of(null))
    ),
    { initialValue: null }
  );

  // Derived state for Tasks of Current Project
  tasks = toSignal(
    toObservable(this.selectedProjectId).pipe(
      switchMap(id => id ? this.taskService.getTasksByProject(id) : of([]))
    ),
    { initialValue: [] }
  );

  onProjectSelect(project: Project) {
    this.selectedProjectId.set(project.id);
  }

  onProjectSaved(project: Project) {
     this.editProjectModal.set(null);
  }

  async openCreateTaskModal() {
    const projectId = this.selectedProjectId();
    if (!projectId) return;
    
    // Create an empty task for immediate editing
    // We'll filter this out of list if strictly needed, or just let it exist as draft if Firestore rules allow.
    // Ideally we'd use a local 'new' mode in modal, but our modal is bound to existing tasks mostly.
    // Let's create a placeholder task in Firestore.
    // A better UX might be local-only until save, but our modal is complex.
    // Let's create it.
    
    this.createEmptyTask(projectId);
  }

  async createEmptyTask(projectId: string, sectionId?: string, date?: Date) {
      try {
          const ref = await this.taskService.createTask({
              projectId,
              sectionId,
              title: '',
              description: '',
              status: 'todo',
              priority: 'medium',
              order: (this.tasks()?.length || 0),
              dueDate: date as any,
              tags: []
          });
          
          const newTask: Task = { 
              id: ref.id, 
              projectId, 
              sectionId,
              title: '', 
              description: '', 
              status: 'todo', 
              priority: 'medium', 
              order: (this.tasks()?.length || 0),
              createdAt: new Date() as any,
              updatedAt: new Date() as any,
              dueDate: date as any 
          };
          
          this.openTask.set(newTask);
      } catch (e) {
          console.error('Failed to create task', e);
      }
  }

  openTaskDetail(task: Task) {
    this.openTask.set(task);
  }

  onTaskUpdated(task: Task) {
    // Optimistic update if needed, but Firestore subscription handles it.
  }

  onTaskDeleted(taskId: string) {
    this.openTask.set(null);
  }

  async deleteTask(taskId: string) {
      if(confirm('Are you sure you want to delete this task?')) {
          await this.taskService.deleteTask(taskId);
      }
  }

  quickAddInBoard(sectionId: string) {
      if(this.selectedProjectId()) {
          this.createEmptyTask(this.selectedProjectId()!, sectionId);
      }
  }
  
  addTaskForDate(date: Date) {
      if(this.selectedProjectId()) {
          this.createEmptyTask(this.selectedProjectId()!, undefined, date);
      }
  }
  
  async addSection() {
     const pid = this.selectedProjectId();
     if(pid) {
         const name = prompt('Section Name:');
         if(name && name.trim()) {
             await this.projectService.addSection(pid, name.trim());
         }
     }
  }
}

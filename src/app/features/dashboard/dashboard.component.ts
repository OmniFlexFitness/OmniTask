import { Component, computed, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of } from 'rxjs';

import { TaskService } from '../../core/services/task.service';
import { ProjectService } from '../../core/services/project.service';
import { AuthService } from '../../core/auth/auth.service';
import { DialogService } from '../../core/services/dialog.service';
import { SeedDataService } from '../../core/services/seed-data.service';
import { GoogleTasksSyncService } from '../../core/services/google-tasks-sync.service';
import { GoogleTasksService } from '../../core/services/google-tasks.service';
import { Project, Task, TaskViewMode } from '../../core/models/domain.model';

import { ProjectSidebarComponent } from '../projects/project-sidebar.component';
import { ProjectFormModalComponent } from '../projects/project-form-modal.component';
import { CustomFieldManagerComponent } from '../projects/components/custom-field-manager/custom-field-manager.component';
import { TaskListViewComponent } from '../tasks/task-list-view.component';
import { TaskBoardViewComponent } from '../tasks/task-board-view.component';
import { TaskCalendarViewComponent } from '../tasks/task-calendar-view.component';
import { TaskDetailModalComponent } from '../tasks/task-detail-modal.component';
import { TaskCreateModalComponent } from '../tasks/task-create-modal.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ProjectSidebarComponent,
    ProjectFormModalComponent,
    TaskListViewComponent,
    TaskBoardViewComponent,
    TaskCalendarViewComponent,
    TaskDetailModalComponent,
    TaskCreateModalComponent,
    CustomFieldManagerComponent,
  ],
  template: `
    <div class="h-screen flex overflow-hidden bg-[#050810]">
      <!-- Sidebar -->
      <div class="w-64 flex-shrink-0 z-20">
        <app-project-sidebar
          [selectedProjectId]="selectedProjectId()"
          (projectSelected)="onProjectSelect($event)"
        ></app-project-sidebar>
      </div>

      <!-- Main Content -->
      <div class="flex-1 flex flex-col min-w-0 bg-slate-950/50 relative">
        <!-- Animated Background with Grid -->
        <div class="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <!-- Grid Pattern -->
          <div class="absolute inset-0 cyber-grid-bg opacity-40"></div>
          
          <!-- Animated Glow Orbs -->
          <div class="absolute top-0 left-1/4 w-[600px] h-[600px] bg-cyan-500/8 rounded-full blur-[120px] animate-pulse"></div>
          <div class="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-fuchsia-500/8 rounded-full blur-[120px] animate-pulse" style="animation-delay: 1.5s;"></div>
          <div class="absolute top-1/2 left-1/2 w-[400px] h-[400px] bg-pink-500/5 rounded-full blur-[100px] animate-pulse" style="animation-delay: 3s;"></div>
        </div>
        
        <!-- Header with Neon Accent -->
        <header class="flex-shrink-0 border-b border-cyan-500/10 bg-[#0a0f1e]/90 backdrop-blur-xl z-20 relative" style="overflow: visible;">
          <!-- Top glow line -->
          <div class="absolute top-0 left-0 right-0 h-px bg-cyan-500/40"></div>
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
                 
                  <button 
                   class="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                   (click)="showFieldManager.set(true)"
                   title="Manage Custom Fields"
                 >
                   <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                   </svg>
                 </button>
                 
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
              <!-- Cyberpunk View Switcher - Purple Glow, No Gradient Fills -->
              <div class="flex bg-[#0a0f1e] p-1 rounded-lg border border-fuchsia-500/20 shadow-[0_0_10px_rgba(224,64,251,0.1)]">
                <button 
                  class="px-4 py-1.5 rounded-md text-sm font-semibold transition-all duration-200"
                  [class.bg-fuchsia-500/20]="viewMode() === 'list'"
                  [class.text-fuchsia-300]="viewMode() === 'list'"
                  [class.text-slate-500]="viewMode() !== 'list'"
                  [class.hover:text-slate-300]="viewMode() !== 'list'"
                  [style.box-shadow]="viewMode() === 'list' ? '0 0 20px rgba(224,64,251,0.4), inset 0 0 10px rgba(224,64,251,0.1)' : 'none'"
                  (click)="viewMode.set('list')"
                >
                  List
                </button>
                <button 
                  class="px-4 py-1.5 rounded-md text-sm font-semibold transition-all duration-200"
                  [class.bg-fuchsia-500/20]="viewMode() === 'board'"
                  [class.text-fuchsia-300]="viewMode() === 'board'"
                  [class.text-slate-500]="viewMode() !== 'board'"
                  [class.hover:text-slate-300]="viewMode() !== 'board'"
                  [style.box-shadow]="viewMode() === 'board' ? '0 0 20px rgba(224,64,251,0.4), inset 0 0 10px rgba(224,64,251,0.1)' : 'none'"
                  (click)="viewMode.set('board')"
                >
                  Board
                </button>
                <button 
                  class="px-4 py-1.5 rounded-md text-sm font-semibold transition-all duration-200"
                  [class.bg-fuchsia-500/20]="viewMode() === 'calendar'"
                  [class.text-fuchsia-300]="viewMode() === 'calendar'"
                  [class.text-slate-500]="viewMode() !== 'calendar'"
                  [class.hover:text-slate-300]="viewMode() !== 'calendar'"
                  [style.box-shadow]="viewMode() === 'calendar' ? '0 0 20px rgba(224,64,251,0.4), inset 0 0 10px rgba(224,64,251,0.1)' : 'none'"
                  (click)="viewMode.set('calendar')"
                >
                   Calendar
                </button>
              </div>

              <!-- Cyberpunk Add Task Button -->
              <button 
                class="ofx-neon-button flex items-center gap-2 !py-2"
                [disabled]="!currentProject()"
                (click)="openCreateTaskModal()"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Add Task
              </button>

              <!-- Google Tasks Sync Button -->
              @if (currentProject()?.syncEnabled && currentProject()?.googleTaskListId) {
                <button
                  class="relative p-2 rounded-lg border transition-all duration-200 group"
                  [class.border-emerald-500/30]="!syncing()"
                  [class.bg-emerald-500/10]="!syncing()"
                  [class.text-emerald-400]="!syncing()"
                  [class.hover:bg-emerald-500/20]="!syncing()"
                  [class.border-amber-500/30]="syncing()"
                  [class.bg-amber-500/10]="syncing()"
                  [class.text-amber-400]="syncing()"
                  [disabled]="syncing()"
                  (click)="syncGoogleTasks()"
                  title="Sync with Google Tasks"
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    class="h-5 w-5" 
                    [class.animate-spin]="syncing()"
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span class="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-400 animate-pulse" *ngIf="!syncing()"></span>
                </button>
              }

              <!-- Project Settings Link -->
              @if (currentProject()) {
                <a
                  [routerLink]="['/projects', currentProject()!.id]"
                  [queryParams]="{ tab: 'settings' }"
                  class="p-2 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-400 hover:bg-fuchsia-500/20 transition-colors"
                  title="Project Settings"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </a>
              }
              
              <!-- User Profile -->
               <div class="relative group">
                 <button class="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center justify-center font-bold">
                   {{ auth.currentUserSig()?.displayName?.charAt(0) }}
                 </button>
                 <div class="absolute top-full right-0 mt-2 w-48 bg-slate-900 border border-white/10 rounded-xl shadow-xl py-2 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all" style="z-index: 9999;">
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
                  [googleTaskListId]="currentProject()?.googleTaskListId"
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

      @if (showCreateModal()) {
        <app-task-create-modal
          [projectId]="selectedProjectId()!"
          [initialSectionId]="createModalSectionId()"
          [initialDueDate]="createModalDueDate()"
          (close)="closeCreateModal()"
          (created)="onTaskCreated($event)"
        ></app-task-create-modal>
      }
      
      @if (showFieldManager() && currentProject()) {
        <div 
          class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" 
          (click)="showFieldManager.set(false)"
        >
           <div class="w-full max-w-lg" (click)="$event.stopPropagation()">
              <app-custom-field-manager [project]="currentProject()!"></app-custom-field-manager>
           </div>
        </div>
      }
    </div>
  `,
})
export class DashboardComponent {
  auth = inject(AuthService);
  projectService = inject(ProjectService);
  taskService = inject(TaskService);
  seedService = inject(SeedDataService);
  dialogService = inject(DialogService);
  router = inject(Router);
  googleTasksSyncService = inject(GoogleTasksSyncService);
  googleTasksService = inject(GoogleTasksService);

  // State
  selectedProjectId = this.projectService.selectedProjectId;
  viewMode = signal<TaskViewMode>('list');
  seeding = signal(false);
  syncing = signal(false);

  constructor() {
    // Seed sample data if user has no projects
    this.seedSampleDataIfNeeded();
  }

  private async seedSampleDataIfNeeded() {
    this.seeding.set(true);
    try {
      const seeded = await this.seedService.seedIfEmpty();
      if (seeded) {
        console.log('Sample data created for new user!');
      }
    } catch (err) {
      console.error('Failed to seed data:', err);
    } finally {
      this.seeding.set(false);
    }
  }

  // Modals state
  editProjectModal = signal<Project | null>(null);
  showFieldManager = signal(false);
  openTask = signal<Task | null>(null);

  // Create modal state
  showCreateModal = signal(false);
  createModalSectionId = signal<string | null>(null);
  createModalDueDate = signal<Date | null>(null);

  // Derived state for Current Project
  currentProject = toSignal(
    toObservable(this.selectedProjectId).pipe(
      switchMap((id) => (id ? this.projectService.getProject$(id) : of(null)))
    ),
    { initialValue: null }
  );

  // Derived state for Tasks of Current Project
  tasks = toSignal(
    toObservable(this.selectedProjectId).pipe(
      switchMap((id) => (id ? this.taskService.getTasksByProject(id) : of([])))
    ),
    { initialValue: [] }
  );

  onProjectSelect(project: Project) {
    this.selectedProjectId.set(project.id);
  }

  onProjectSaved(project: Project) {
    this.editProjectModal.set(null);
  }

  openCreateTaskModal(sectionId?: string, dueDate?: Date) {
    if (!this.selectedProjectId()) return;
    this.createModalSectionId.set(sectionId || null);
    this.createModalDueDate.set(dueDate || null);
    this.showCreateModal.set(true);
  }

  closeCreateModal() {
    this.showCreateModal.set(false);
    this.createModalSectionId.set(null);
    this.createModalDueDate.set(null);
  }

  onTaskCreated(task: Task) {
    // Firestore subscription handles the list update
    // Optionally open the task detail for further edits
    // this.openTask.set(task);
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
    if (await this.dialogService.confirm('Are you sure you want to delete this task?')) {
      await this.taskService.deleteTask(taskId);
    }
  }

  quickAddInBoard(sectionId: string) {
    this.openCreateTaskModal(sectionId);
  }

  addTaskForDate(date: Date) {
    this.openCreateTaskModal(undefined, date);
  }

  async addSection() {
    const pid = this.selectedProjectId();
    if (pid) {
      const name = prompt('Section Name:');
      if (name && name.trim()) {
        await this.projectService.addSection(pid, name.trim());
      }
    }
  }

  async syncGoogleTasks() {
    const project = this.currentProject();
    if (!project?.googleTaskListId) {
      await this.dialogService.alert(
        'Please configure Google Tasks sync in project settings first.',
        'Sync Not Configured'
      );
      return;
    }

    // Check if Google Tasks is authenticated
    if (!this.googleTasksService.isAuthenticated()) {
      const shouldReauth = await this.dialogService.confirm(
        'Google Tasks is not connected. You need to sign out and sign in again to grant permission to access Google Tasks.\n\nWould you like to sign out now?',
        'Google Tasks Not Connected'
      );
      if (shouldReauth) {
        await this.auth.logout();
      }
      return;
    }

    this.syncing.set(true);
    try {
      // Update sync status to pending
      await this.projectService.updateProject(project.id, { syncStatus: 'pending' });

      // Get the last sync timestamp
      const lastSyncAt = project.lastSyncAt;
      const lastSyncDate = lastSyncAt
        ? lastSyncAt instanceof Date
          ? lastSyncAt
          : (lastSyncAt as any).toDate?.() || undefined
        : undefined;

      // Pull tasks from Google Tasks
      const result = await this.googleTasksSyncService.pullFromGoogleTasks(
        project.id,
        project.googleTaskListId,
        lastSyncDate
      );

      console.log(`Sync complete: ${result.added} added, ${result.updated} updated`);

      // Show success message
      await this.dialogService.alert(
        `Sync complete!\n\n${result.added} tasks added, ${result.updated} tasks updated.`,
        'Sync Successful'
      );

      // Mark as synced
      await this.projectService.updateProject(project.id, {
        syncStatus: 'synced',
        lastSyncAt: new Date(),
      });
    } catch (error: any) {
      console.error('Sync failed:', error);
      await this.projectService.updateProject(project.id, { syncStatus: 'error' });

      // Provide specific error message
      let errorMessage = 'Sync failed. Please try again.';
      if (error?.message?.includes('not authenticated')) {
        errorMessage = 'Google Tasks authentication expired. Please sign out and sign in again.';
      } else if (error?.status === 401 || error?.status === 403) {
        errorMessage = 'Access denied. Please sign out and sign in again to refresh permissions.';
      }
      await this.dialogService.alert(errorMessage, 'Sync Error');
    } finally {
      this.syncing.set(false);
    }
  }
}

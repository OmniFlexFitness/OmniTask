import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import { UserService } from '../../core/services/user.service';
import { ProjectService } from '../../core/services/project.service';
import { TaskService } from '../../core/services/task.service';
import { DialogService } from '../../core/services/dialog.service';
import { UserProfile } from '../../core/models/user.model';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="h-screen overflow-y-auto bg-[#0a0a0a] text-gray-200">
      <div class="p-8 max-w-7xl mx-auto flex flex-col gap-8">
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div>
            <h1
              class="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400"
            >
              Admin Dashboard
            </h1>
            <p class="text-gray-400 mt-2">Manage users, projects, and global tasks.</p>
          </div>
          <button
            (click)="router.navigate(['/'])"
            class="px-4 py-2 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors focus:ring-2 focus:ring-cyan-500/50 outline-none"
          >
            Back to App
          </button>
        </div>

        <!-- Stats Cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div
            class="bg-black/30 border border-white/10 rounded-xl p-6 relative overflow-hidden group hover:border-purple-500/50 transition-colors"
          >
            <div
              class="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
            ></div>
            <h3 class="text-gray-400 font-medium">Total Users</h3>
            <p class="text-4xl font-bold mt-2 text-white">{{ users().length }}</p>
          </div>
          <div
            class="bg-black/30 border border-white/10 rounded-xl p-6 relative overflow-hidden group hover:border-cyan-500/50 transition-colors"
          >
            <div
              class="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
            ></div>
            <h3 class="text-gray-400 font-medium">Total Projects</h3>
            <p class="text-4xl font-bold mt-2 text-white">{{ projects().length }}</p>
          </div>
          <div
            class="bg-black/30 border border-white/10 rounded-xl p-6 relative overflow-hidden group hover:border-blue-500/50 transition-colors"
          >
            <div
              class="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
            ></div>
            <h3 class="text-gray-400 font-medium">Total Tasks</h3>
            <p class="text-4xl font-bold mt-2 text-white">{{ tasks().length }}</p>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="flex border-b border-white/10 gap-8">
          <button
            *ngFor="let tab of tabs"
            (click)="activeTab.set(tab)"
            [class.border-cyan-400]="activeTab() === tab"
            [class.text-cyan-400]="activeTab() === tab"
            [class.border-transparent]="activeTab() !== tab"
            [class.text-gray-400]="activeTab() !== tab"
            [class.hover:text-white]="activeTab() !== tab"
            class="pb-3 border-b-2 font-medium transition-colors outline-none"
          >
            {{ tab }}
          </button>
        </div>

        <!-- Users Tab -->
        <div *ngIf="activeTab() === 'Users'" class="flex flex-col gap-4">
          <div
            class="bg-black/40 border border-white/10 rounded-xl overflow-hidden backdrop-blur-md"
          >
            <table class="w-full text-left text-sm text-gray-300">
              <thead class="text-xs uppercase bg-black/60 text-gray-400">
                <tr>
                  <th class="px-6 py-4">User</th>
                  <th class="px-6 py-4">Email</th>
                  <th class="px-6 py-4">Role</th>
                  <th class="px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  *ngFor="let user of users()"
                  class="border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <td class="px-6 py-4 font-medium text-white flex items-center gap-4">
                    <div
                      class="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center border border-purple-500/30 text-purple-200"
                    >
                      {{ user.displayName ? user.displayName.charAt(0) : 'U' }}
                    </div>
                    <div>
                      <div class="font-medium">{{ user.displayName || 'Unknown User' }}</div>
                      <div class="text-xs text-gray-500 mt-0.5">ID: {{ user.uid }}</div>
                    </div>
                  </td>
                  <td class="px-6 py-4">{{ user.email }}</td>
                  <td class="px-6 py-4">
                    <span
                      class="px-3 py-1 text-xs font-semibold rounded-full border"
                      [class.bg-purple-500/10]="user.role === 'admin'"
                      [class.border-purple-500/30]="user.role === 'admin'"
                      [class.text-purple-400]="user.role === 'admin'"
                      [class.bg-white/5]="user.role !== 'admin'"
                      [class.border-white/10]="user.role !== 'admin'"
                      [class.text-gray-400]="user.role !== 'admin'"
                    >
                      {{ user.role === 'admin' ? 'Admin' : 'User' }}
                    </span>
                  </td>
                  <td class="px-6 py-4">
                    <button
                      *ngIf="user.role !== 'admin'"
                      (click)="promoteToAdmin(user)"
                      class="text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
                    >
                      Promote to Admin
                    </button>
                    <button
                      *ngIf="user.role === 'admin'"
                      (click)="demoteToUser(user)"
                      class="text-rose-400 hover:text-rose-300 font-medium transition-colors"
                    >
                      Demote
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Projects Tab -->
        <div *ngIf="activeTab() === 'Projects'" class="flex flex-col gap-4">
          <div
            class="bg-black/40 border border-white/10 rounded-xl overflow-hidden backdrop-blur-md"
          >
            <table class="w-full text-left text-sm text-gray-300">
              <thead class="text-xs uppercase bg-black/60 text-gray-400">
                <tr>
                  <th class="px-6 py-4">Project Name</th>
                  <th class="px-6 py-4">Status</th>
                  <th class="px-6 py-4">Owner ID</th>
                  <th class="px-6 py-4">Members</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  *ngFor="let project of projects()"
                  class="border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <td class="px-6 py-4 font-medium text-white flex items-center gap-3">
                    <div
                      class="w-4 h-4 rounded-full"
                      [style.backgroundColor]="project.color || '#6366f1'"
                    ></div>
                    <div>
                      <div>{{ project.name }}</div>
                      <div class="text-xs text-gray-500 font-normal mt-0.5">
                        ID: {{ project.id }}
                      </div>
                    </div>
                  </td>
                  <td class="px-6 py-4">
                    <span
                      class="px-2.5 py-1 text-[10px] font-semibold tracking-wider rounded-full bg-white/5 border border-white/10 uppercase"
                    >
                      {{ project.status }}
                    </span>
                  </td>
                  <td class="px-6 py-4 font-mono text-xs text-gray-400">{{ project.ownerId }}</td>
                  <td class="px-6 py-4">
                    <span class="px-2 py-1 bg-white/5 rounded text-xs font-mono">{{
                      project.memberIds.length
                    }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Tasks Tab -->
        <div *ngIf="activeTab() === 'Tasks'" class="flex flex-col gap-4">
          <div
            class="bg-black/40 border border-white/10 rounded-xl overflow-hidden backdrop-blur-md"
          >
            <table class="w-full text-left text-sm text-gray-300">
              <thead class="text-xs uppercase bg-black/60 text-gray-400">
                <tr>
                  <th class="px-6 py-4">Task Title</th>
                  <th class="px-6 py-4">Status</th>
                  <th class="px-6 py-4">Priority</th>
                  <th class="px-6 py-4">Project ID</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  *ngFor="let task of tasks()"
                  class="border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <td class="px-6 py-4">
                    <div class="font-medium text-white">{{ task.title }}</div>
                    <div class="text-[10px] text-gray-500 font-mono mt-1">ID: {{ task.id }}</div>
                  </td>
                  <td class="px-6 py-4">
                    <span class="flex items-center gap-2">
                      <span
                        class="w-2 h-2 rounded-full"
                        [class.bg-gray-500]="task.status === 'todo'"
                        [class.bg-cyan-500]="task.status === 'in-progress'"
                        [class.bg-purple-500]="task.status === 'done'"
                      ></span>
                      <span
                        class="text-xs uppercase font-medium"
                        [class.text-gray-400]="task.status === 'todo'"
                        [class.text-cyan-400]="task.status === 'in-progress'"
                        [class.text-purple-400]="task.status === 'done'"
                        >{{ task.status }}</span
                      >
                    </span>
                  </td>
                  <td class="px-6 py-4">
                    <span
                      class="px-2 py-1 text-[10px] uppercase font-bold rounded"
                      [class.bg-rose-500/20]="task.priority === 'high'"
                      [class.text-rose-400]="task.priority === 'high'"
                      [class.bg-amber-500/20]="task.priority === 'medium'"
                      [class.text-amber-400]="task.priority === 'medium'"
                      [class.bg-blue-500/20]="task.priority === 'low'"
                      [class.text-blue-400]="task.priority === 'low'"
                    >
                      {{ task.priority }}
                    </span>
                  </td>
                  <td class="px-6 py-4 font-mono text-xs opacity-70">{{ task.projectId }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AdminDashboardComponent {
  userService = inject(UserService);
  projectService = inject(ProjectService);
  taskService = inject(TaskService);
  dialogService = inject(DialogService);
  router = inject(Router);

  tabs = ['Users', 'Projects', 'Tasks'];
  activeTab = signal('Users');

  users = toSignal(this.userService.getAllUsers(), { initialValue: [] });
  projects = toSignal(this.projectService.getAllProjects(), { initialValue: [] });
  tasks = toSignal(this.taskService.getAllTasks(), { initialValue: [] });

  async promoteToAdmin(user: UserProfile) {
    if (
      await this.dialogService.confirm(
        `Are you sure you want to promote ${user.displayName} to Admin?`,
      )
    ) {
      await this.userService.updateUserRole(user.uid, 'admin');
    }
  }

  async demoteToUser(user: UserProfile) {
    if (
      await this.dialogService.confirm(
        `Are you sure you want to demote ${user.displayName} to User?`,
      )
    ) {
      await this.userService.updateUserRole(user.uid, 'user');
    }
  }
}

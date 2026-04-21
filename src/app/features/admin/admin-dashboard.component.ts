import { Component, ChangeDetectionStrategy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';

import { UserService } from '../../core/services/user.service';
import { ProjectService } from '../../core/services/project.service';
import { TaskService } from '../../core/services/task.service';
import { DialogService } from '../../core/services/dialog.service';
import { AuthService } from '../../core/auth/auth.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { InvitesService } from '../../core/services/invites.service';
import { Invite } from '../../core/models/invite.model';
import {
  DEFAULT_USER_PERMISSIONS,
  UserPermissions,
  UserProfile,
  resolvePermissions,
} from '../../core/models/user.model';
import { ORG_DOMAIN, SUPER_ADMIN_EMAIL } from '../../core/constants';

type AdminTab = 'Users' | 'Projects' | 'Tasks' | 'Permissions' | 'Invites';

interface PermissionToggle {
  key: keyof UserPermissions;
  label: string;
  description: string;
}

const PERMISSION_TOGGLES: PermissionToggle[] = [
  {
    key: 'canCreateProjects',
    label: 'Create projects',
    description: 'Create new projects in the workspace.',
  },
  {
    key: 'canCreateTasks',
    label: 'Create tasks',
    description: 'Add tasks to any project they are a member of.',
  },
  {
    key: 'canDeleteProjects',
    label: 'Delete projects',
    description: 'Delete projects they own.',
  },
  {
    key: 'canDeleteTasks',
    label: 'Delete tasks',
    description: 'Delete tasks within their projects.',
  },
  {
    key: 'canInviteMembers',
    label: 'Invite members',
    description: 'Add other users to projects.',
  },
  {
    key: 'isSuperAdmin',
    label: 'Super admin',
    description: 'Manage permissions for every user (grant with care).',
  },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="h-screen overflow-y-auto bg-[#0a0a0a] text-gray-200">
      <div class="p-8 max-w-7xl mx-auto flex flex-col gap-8">
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div>
            <h1
              data-scramble
              class="text-4xl font-bold text-cyan-300"
              style="text-shadow: 0 0 14px rgba(0, 210, 255, 0.5);"
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
              class="absolute inset-0 bg-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
            ></div>
            <h3 class="text-gray-400 font-medium">Total Users</h3>
            <p class="text-4xl font-bold mt-2 text-white">{{ users().length }}</p>
          </div>
          <div
            class="bg-black/30 border border-white/10 rounded-xl p-6 relative overflow-hidden group hover:border-cyan-500/50 transition-colors"
          >
            <div
              class="absolute inset-0 bg-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
            ></div>
            <h3 class="text-gray-400 font-medium">Total Projects</h3>
            <p class="text-4xl font-bold mt-2 text-white">{{ projects().length }}</p>
          </div>
          <div
            class="bg-black/30 border border-white/10 rounded-xl p-6 relative overflow-hidden group hover:border-blue-500/50 transition-colors"
          >
            <div
              class="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
            ></div>
            <h3 class="text-gray-400 font-medium">Total Tasks</h3>
            <p class="text-4xl font-bold mt-2 text-white">{{ tasks().length }}</p>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="flex border-b border-white/10 gap-8">
          <button
            *ngFor="let tab of visibleTabs()"
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
            class="bg-black/40 border border-white/10 rounded-xl overflow-hidden "
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
            class="bg-black/40 border border-white/10 rounded-xl overflow-hidden "
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
            class="bg-black/40 border border-white/10 rounded-xl overflow-hidden "
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

        <!-- Permissions Tab (super-admin only) -->
        <div *ngIf="activeTab() === 'Permissions'" class="flex flex-col gap-4">
          <div
            class="rounded-xl p-5 border border-purple-500/30 bg-purple-500/10"
          >
            <div class="flex items-start justify-between gap-4">
              <div>
                <h2 class="text-lg font-semibold text-white">User rights &amp; permissions</h2>
                <p class="text-sm text-gray-400 mt-1">
                  Grant granular rights to users &mdash; particularly those in the
                  <span class="font-mono text-cyan-300">{{ orgDomain }}</span> domain who could not
                  previously create projects or tasks. Changes apply immediately.
                </p>
              </div>
              <label
                class="flex items-center gap-2 text-xs text-gray-300 bg-black/40 border border-white/10 rounded-lg px-3 py-2 cursor-pointer select-none"
              >
                <input
                  #orgOnly
                  type="checkbox"
                  [checked]="orgDomainOnly()"
                  (change)="orgDomainOnly.set(orgOnly.checked)"
                  class="accent-cyan-400"
                />
                Only show &#64;{{ orgDomain }}
              </label>
            </div>
          </div>

          <div class="flex flex-col gap-4">
            <div
              *ngFor="let user of filteredUsers(); trackBy: trackByUid"
              class="bg-black/40 border border-white/10 rounded-xl p-5 "
              [class.border-purple-500/40]="user.email === superAdminEmail"
            >
              <div class="flex items-start justify-between gap-4 flex-wrap">
                <div class="flex items-center gap-3">
                  <div
                    class="w-10 h-10 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-200 font-semibold"
                  >
                    {{ user.displayName ? user.displayName.charAt(0) : 'U' }}
                  </div>
                  <div>
                    <div class="text-white font-medium">
                      {{ user.displayName || 'Unknown User' }}
                      <span
                        *ngIf="user.email === superAdminEmail"
                        class="ml-2 text-[10px] uppercase tracking-wider text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded-full"
                      >
                        Super Admin
                      </span>
                    </div>
                    <div class="text-xs text-gray-400 mt-0.5">{{ user.email }}</div>
                    <div class="text-[10px] text-gray-500 font-mono mt-0.5">
                      domain: {{ user.domain }}
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <button
                    (click)="resetToDefaults(user)"
                    [disabled]="user.email === superAdminEmail"
                    class="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-300 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Reset to defaults
                  </button>
                  <button
                    (click)="grantAll(user)"
                    [disabled]="user.email === superAdminEmail"
                    class="text-xs px-3 py-1.5 rounded-lg border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Grant all
                  </button>
                  <button
                    (click)="revokeAll(user)"
                    [disabled]="user.email === superAdminEmail"
                    class="text-xs px-3 py-1.5 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Revoke all
                  </button>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-5">
                <label
                  *ngFor="let toggle of toggles"
                  class="flex items-start gap-3 p-3 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] cursor-pointer transition-colors"
                  [class.opacity-60]="user.email === superAdminEmail && toggle.key !== 'isSuperAdmin'"
                >
                  <input
                    #permToggle
                    type="checkbox"
                    class="mt-1 accent-cyan-400 w-4 h-4"
                    [checked]="effective(user)[toggle.key]"
                    [disabled]="user.email === superAdminEmail"
                    (change)="togglePermission(user, toggle.key, permToggle.checked)"
                  />
                  <div class="flex flex-col">
                    <span class="text-sm text-white font-medium">{{ toggle.label }}</span>
                    <span class="text-xs text-gray-400">{{ toggle.description }}</span>
                  </div>
                </label>
              </div>
            </div>

            <div
              *ngIf="filteredUsers().length === 0"
              class="text-center text-gray-500 py-12 border border-dashed border-white/10 rounded-xl"
            >
              No users match the current filter.
            </div>
          </div>
        </div>

        <!-- Invites Tab (super-admin only) -->
        <div *ngIf="activeTab() === 'Invites'" class="flex flex-col gap-4">
          <div
            class="rounded-xl p-5 border border-cyan-500/30 bg-cyan-500/10 flex items-start justify-between gap-4 flex-wrap"
          >
            <div>
              <h2 class="text-lg font-semibold text-white">Invite users</h2>
              <p class="text-sm text-gray-400 mt-1">
                Pre-configure role and permissions for a user. The grants are applied
                automatically the first time they sign in with that email.
              </p>
            </div>
            <button
              (click)="openInviteForm()"
              class="omni-glitch-btn px-4 py-2 bg-cyan-500 text-white text-sm font-semibold rounded-lg
                     hover:bg-cyan-400 hover:shadow-[0_0_18px_rgba(0,210,255,0.5)]
                     transition-all"
            >
              + New invite
            </button>
          </div>

          <div
            class="bg-black/40 border border-white/10 rounded-xl overflow-hidden"
          >
            <table class="w-full text-left text-sm text-gray-300">
              <thead class="text-xs uppercase bg-black/60 text-gray-400">
                <tr>
                  <th class="px-6 py-4">Email</th>
                  <th class="px-6 py-4">Role</th>
                  <th class="px-6 py-4">Status</th>
                  <th class="px-6 py-4">Invited by</th>
                  <th class="px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  *ngFor="let invite of invites()"
                  class="border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <td class="px-6 py-4 font-medium text-white">{{ invite.email }}</td>
                  <td class="px-6 py-4 capitalize">{{ invite.role }}</td>
                  <td class="px-6 py-4">
                    <span
                      class="px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-full border"
                      [class.bg-amber-500/10]="invite.status === 'pending'"
                      [class.border-amber-500/30]="invite.status === 'pending'"
                      [class.text-amber-300]="invite.status === 'pending'"
                      [class.bg-emerald-500/10]="invite.status === 'accepted'"
                      [class.border-emerald-500/30]="invite.status === 'accepted'"
                      [class.text-emerald-300]="invite.status === 'accepted'"
                      [class.bg-rose-500/10]="invite.status === 'revoked'"
                      [class.border-rose-500/30]="invite.status === 'revoked'"
                      [class.text-rose-300]="invite.status === 'revoked'"
                    >
                      {{ invite.status }}
                    </span>
                  </td>
                  <td class="px-6 py-4 text-xs text-gray-400">{{ invite.invitedByEmail }}</td>
                  <td class="px-6 py-4">
                    <button
                      *ngIf="invite.status === 'pending'"
                      (click)="revokeInvite(invite)"
                      class="text-rose-400 hover:text-rose-300 font-medium transition-colors"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
                <tr *ngIf="invites().length === 0">
                  <td colspan="5" class="px-6 py-12 text-center text-gray-500">
                    No invites yet. Click “New invite” to pre-configure a user's access.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Invite modal -->
      <div
        *ngIf="showInviteForm()"
        class="fixed inset-0 z-[9999] flex items-center justify-center"
      >
        <div
          class="absolute inset-0 bg-black/70 "
          (click)="closeInviteForm()"
        ></div>
        <div
          class="relative bg-slate-900 border border-white/20 rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden"
        >
          <div
            class="px-6 py-4 border-b border-white/10 bg-cyan-600/15"
          >
            <h3 data-scramble class="text-lg font-semibold text-white">Invite a user</h3>
            <p class="text-xs text-gray-400 mt-1">
              Role and permissions apply on the user's first sign-in.
            </p>
          </div>
          <form (submit)="submitInvite($event)" class="px-6 py-5 flex flex-col gap-4">
            <label class="flex flex-col gap-1">
              <span class="text-xs uppercase tracking-wider text-gray-400">Email</span>
              <input
                name="email"
                type="email"
                required
                [(ngModel)]="inviteEmail"
                placeholder="user@omniflexfitness.com"
                class="px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 outline-none"
              />
            </label>

            <label class="flex flex-col gap-1">
              <span class="text-xs uppercase tracking-wider text-gray-400">Role</span>
              <select
                name="role"
                [(ngModel)]="inviteRole"
                class="px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 outline-none"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </label>

            <div>
              <div class="text-xs uppercase tracking-wider text-gray-400 mb-2">Permissions</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label
                  *ngFor="let toggle of invitableToggles"
                  class="flex items-start gap-2 p-2 rounded-lg border border-white/5 bg-white/[0.02] cursor-pointer"
                >
                  <input
                    #inviteToggle
                    type="checkbox"
                    class="mt-1 accent-cyan-400"
                    [checked]="invitePermissions()[toggle.key]"
                    (change)="setInvitePermission(toggle.key, inviteToggle.checked)"
                  />
                  <div class="flex flex-col">
                    <span class="text-sm text-white">{{ toggle.label }}</span>
                    <span class="text-[11px] text-gray-500">{{ toggle.description }}</span>
                  </div>
                </label>
              </div>
            </div>

            <label class="flex flex-col gap-1">
              <span class="text-xs uppercase tracking-wider text-gray-400"
                >Note (optional)</span
              >
              <input
                name="note"
                type="text"
                [(ngModel)]="inviteNote"
                placeholder="Internal note, e.g. 'New PM on team'"
                class="px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 outline-none"
              />
            </label>

            <div class="flex justify-end gap-3 pt-2">
              <button
                type="button"
                (click)="closeInviteForm()"
                class="px-4 py-2 rounded-lg border border-white/10 text-gray-300 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                [disabled]="inviteSubmitting()"
                class="omni-glitch-btn px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-white font-semibold disabled:opacity-50 shadow-[0_0_14px_rgba(0,210,255,0.4)]"
              >
                {{ inviteSubmitting() ? 'Sending…' : 'Send invite' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
})
export class AdminDashboardComponent {
  readonly userService = inject(UserService);
  readonly projectService = inject(ProjectService);
  readonly taskService = inject(TaskService);
  readonly dialogService = inject(DialogService);
  readonly router = inject(Router);
  readonly authService = inject(AuthService);
  readonly permissionsService = inject(PermissionsService);
  readonly invitesService = inject(InvitesService);

  currentUser = this.authService.currentUserSig;
  isSuperAdmin = this.permissionsService.isSuperAdmin;

  readonly superAdminEmail = SUPER_ADMIN_EMAIL;
  readonly orgDomain = ORG_DOMAIN;
  readonly toggles = PERMISSION_TOGGLES;
  // Invite form hides the isSuperAdmin toggle — super-admin must be granted
  // explicitly from the Permissions tab after a user exists.
  readonly invitableToggles = PERMISSION_TOGGLES.filter((t) => t.key !== 'isSuperAdmin');

  activeTab = signal<AdminTab>('Users');
  orgDomainOnly = signal(true);

  users = toSignal(this.userService.getAllUsers(), { initialValue: [] });
  projects = toSignal(this.projectService.getAllProjects(), { initialValue: [] });
  tasks = toSignal(this.taskService.getAllTasks(), { initialValue: [] });
  invites = toSignal(this.invitesService.getAllInvites(), { initialValue: [] as Invite[] });

  // Invite form state
  showInviteForm = signal(false);
  inviteSubmitting = signal(false);
  inviteEmail = '';
  inviteRole: 'admin' | 'user' = 'user';
  inviteNote = '';
  invitePermissions = signal<UserPermissions>({ ...DEFAULT_USER_PERMISSIONS });

  visibleTabs = computed<AdminTab[]>(() => {
    const base: AdminTab[] = ['Users', 'Projects', 'Tasks'];
    return this.isSuperAdmin() ? [...base, 'Permissions', 'Invites'] : base;
  });

  filteredUsers = computed(() => {
    const all = this.users();
    if (!this.orgDomainOnly()) return all;
    return all.filter((u) => u.domain?.toLowerCase() === ORG_DOMAIN);
  });

  trackByUid(_index: number, user: UserProfile) {
    return user.uid;
  }

  effective(user: UserProfile): UserPermissions {
    return resolvePermissions(user);
  }

  async togglePermission(user: UserProfile, key: keyof UserPermissions, value: boolean) {
    if (user.email === SUPER_ADMIN_EMAIL) {
      this.dialogService.alert(
        'The super-admin account cannot have its permissions modified.',
        'Action Not Allowed',
      );
      return;
    }
    try {
      await this.userService.setUserPermission(user, key, value);
    } catch (err) {
      console.error('Failed to update permission:', err);
      this.dialogService.alert(this.friendlyWriteError(err), 'Error');
    }
  }

  async resetToDefaults(user: UserProfile) {
    if (user.email === SUPER_ADMIN_EMAIL) return;
    if (
      await this.dialogService.confirm(
        `Reset ${user.displayName || user.email}'s permissions to defaults?`,
      )
    ) {
      try {
        await this.userService.updateUserPermissions(user.uid, { ...DEFAULT_USER_PERMISSIONS });
        this.dialogService.alert('Permissions reset to defaults.', 'Done');
      } catch (err) {
        console.error('Failed to reset permissions:', err);
        this.dialogService.alert(this.friendlyWriteError(err), 'Error');
      }
    }
  }

  async grantAll(user: UserProfile) {
    if (user.email === SUPER_ADMIN_EMAIL) return;
    try {
      await this.userService.updateUserPermissions(user.uid, {
        canCreateProjects: true,
        canCreateTasks: true,
        canDeleteProjects: true,
        canDeleteTasks: true,
        canInviteMembers: true,
        isSuperAdmin: false,
      });
      this.dialogService.alert(
        `${user.displayName || user.email} now has all permissions (except super-admin).`,
        'Done',
      );
    } catch (err) {
      console.error('Failed to grant permissions:', err);
      this.dialogService.alert(this.friendlyWriteError(err), 'Error');
    }
  }

  async revokeAll(user: UserProfile) {
    if (user.email === SUPER_ADMIN_EMAIL) return;
    if (
      await this.dialogService.confirm(
        `Revoke all permissions from ${user.displayName || user.email}?`,
      )
    ) {
      try {
        await this.userService.updateUserPermissions(user.uid, {
          canCreateProjects: false,
          canCreateTasks: false,
          canDeleteProjects: false,
          canDeleteTasks: false,
          canInviteMembers: false,
          isSuperAdmin: false,
        });
        this.dialogService.alert('All permissions revoked.', 'Done');
      } catch (err) {
        console.error('Failed to revoke permissions:', err);
        this.dialogService.alert(this.friendlyWriteError(err), 'Error');
      }
    }
  }

  async promoteToAdmin(user: UserProfile) {
    if (
      await this.dialogService.confirm(
        `Are you sure you want to promote ${user.displayName} to Admin?`,
      )
    ) {
      try {
        await this.userService.updateUserRole(user.uid, 'admin');
        this.dialogService.alert(`${user.displayName || user.email} is now an admin.`, 'Done');
      } catch (error) {
        console.error('Failed to promote user:', error);
        this.dialogService.alert(this.friendlyWriteError(error), 'Error');
      }
    }
  }

  async demoteToUser(user: UserProfile) {
    if (user.uid === this.currentUser()?.uid) {
      this.dialogService.alert('You cannot demote your own account.', 'Action Not Allowed');
      return;
    }
    if (user.email === SUPER_ADMIN_EMAIL) {
      this.dialogService.alert(
        'The designated super-admin cannot be demoted.',
        'Action Not Allowed',
      );
      return;
    }

    if (
      await this.dialogService.confirm(
        `Are you sure you want to demote ${user.displayName} to User?`,
      )
    ) {
      try {
        await this.userService.updateUserRole(user.uid, 'user');
        this.dialogService.alert(`${user.displayName || user.email} is now a regular user.`, 'Done');
      } catch (error) {
        console.error('Failed to demote user:', error);
        this.dialogService.alert(this.friendlyWriteError(error), 'Error');
      }
    }
  }

  // --- Invites ---

  openInviteForm() {
    this.inviteEmail = '';
    this.inviteRole = 'user';
    this.inviteNote = '';
    this.invitePermissions.set({ ...DEFAULT_USER_PERMISSIONS });
    this.showInviteForm.set(true);
  }

  closeInviteForm() {
    if (this.inviteSubmitting()) return;
    this.showInviteForm.set(false);
  }

  setInvitePermission(key: keyof UserPermissions, value: boolean) {
    this.invitePermissions.update((prev) => ({ ...prev, [key]: value }));
  }

  async submitInvite(event: Event) {
    event.preventDefault();
    if (this.inviteSubmitting()) return;
    const email = this.inviteEmail.trim();
    if (!email) {
      this.dialogService.alert('Please enter an email address.', 'Missing email');
      return;
    }

    this.inviteSubmitting.set(true);
    try {
      await this.invitesService.createInvite(
        email,
        this.inviteRole,
        this.invitePermissions(),
        this.inviteNote.trim() || undefined,
      );
      this.showInviteForm.set(false);
      this.dialogService.alert(
        `Invite created for ${email}. Their role and permissions will be applied the next time they sign in.`,
        'Invite sent',
      );
    } catch (err) {
      console.error('Failed to create invite:', err);
      this.dialogService.alert(this.friendlyWriteError(err), 'Error');
    } finally {
      this.inviteSubmitting.set(false);
    }
  }

  async revokeInvite(invite: Invite) {
    if (!invite.id) return;
    if (!(await this.dialogService.confirm(`Revoke invite for ${invite.email}?`))) return;
    try {
      await this.invitesService.revokeInvite(invite.id);
    } catch (err) {
      console.error('Failed to revoke invite:', err);
      this.dialogService.alert(this.friendlyWriteError(err), 'Error');
    }
  }

  /**
   * Map Firestore permission-denied errors to actionable guidance; otherwise
   * surface the underlying message.
   */
  private friendlyWriteError(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err);
    if (/permission|insufficient|PERMISSION_DENIED/i.test(message)) {
      return (
        'The server rejected this change. Make sure Firestore rules are deployed ' +
        '(`yarn deploy:firestore`) and that you are signed in as a super-admin.'
      );
    }
    return message || 'Unknown error. Please try again.';
  }
}

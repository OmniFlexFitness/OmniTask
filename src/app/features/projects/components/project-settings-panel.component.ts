import { Component, input, output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../core/services/project.service';
import { DialogService } from '../../../core/services/dialog.service';
import { AuthService } from '../../../core/auth/auth.service';
import {
  GoogleTasksService,
  GoogleTaskList,
  GoogleTask,
} from '../../../core/services/google-tasks.service';
import { GoogleTasksSyncService } from '../../../core/services/google-tasks-sync.service';
import { Project } from '../../../core/models/domain.model';
import { SectionManagerComponent } from './section-manager.component';
import { TagManagerComponent } from './tag-manager.component';
import { CustomFieldManagerComponent } from './custom-field-manager/custom-field-manager.component';
import { ProjectMemberManagerComponent } from './project-member-manager.component';
import { firstValueFrom } from 'rxjs';

/**
 * Project colors for selection
 */
const PROJECT_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#0ea5e9', // Sky
  '#00d2ff', // Cyan (OmniFlex accent)
];

/**
 * Project Settings Panel Component
 * Comprehensive project configuration including basic info, sections, tags, custom fields
 */
@Component({
  selector: 'app-project-settings-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SectionManagerComponent,
    TagManagerComponent,
    CustomFieldManagerComponent,
    ProjectMemberManagerComponent,
  ],
  template: `
    <div class="space-y-8">
      <!-- Basic Info Section -->
      <section class="ofx-settings-section">
        <h3 class="ofx-section-title">Basic Information</h3>

        <div class="space-y-4 mt-4">
          <!-- Project Name -->
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-2">Project Name</label>
            <input
              type="text"
              [value]="project().name"
              (input)="onNameChange($event)"
              class="ofx-input"
              placeholder="Project name"
            />
          </div>

          <!-- Description -->
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-2">Description</label>
            <textarea
              [value]="project().description || ''"
              (input)="onDescriptionChange($event)"
              rows="3"
              class="ofx-input"
              placeholder="What is this project about?"
            ></textarea>
          </div>

          <!-- Color -->
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-3">Project Color</label>
            <div class="flex flex-wrap gap-2">
              @for (color of colors; track color) {
                <button
                  type="button"
                  class="w-8 h-8 rounded-lg transition-all duration-200 hover:scale-110"
                  [class.ring-2]="project().color === color"
                  [class.ring-white]="project().color === color"
                  [class.scale-110]="project().color === color"
                  [style.background-color]="color"
                  [style.box-shadow]="'0 0 10px ' + color + '60'"
                  (click)="updateColor(color)"
                ></button>
              }
            </div>
          </div>

          <!-- Save Button -->
          @if (hasBasicChanges()) {
            <div class="flex gap-2 pt-2">
              <button class="ofx-gradient-button" [disabled]="saving()" (click)="saveBasicInfo()">
                {{ saving() ? 'Saving...' : 'Save Changes' }}
              </button>
              <button class="ofx-ghost-button" (click)="resetBasicInfo()">Cancel</button>
            </div>
          }
        </div>
      </section>

      <hr class="border-white/10" />

      <!-- Sections Management -->
      <section class="ofx-settings-section">
        <app-section-manager
          [projectId]="project().id"
          [sections]="project().sections || []"
          (sectionsChanged)="projectChanged.emit()"
        ></app-section-manager>
      </section>

      <hr class="border-white/10" />

      <!-- Tags Management -->
      <section class="ofx-settings-section">
        <app-tag-manager
          [projectId]="project().id"
          [tags]="project().tags || []"
          (tagsChanged)="projectChanged.emit()"
        ></app-tag-manager>
      </section>

      <hr class="border-white/10" />

      <!-- Custom Fields -->
      <section class="ofx-settings-section">
        <h3 class="text-sm font-semibold text-slate-200 mb-4">Custom Fields</h3>
        <app-custom-field-manager [project]="project()"></app-custom-field-manager>
      </section>

      <hr class="border-white/10" />

      <!-- Members Section (Placeholder) -->
      <!-- Members Section -->
      <section class="ofx-settings-section">
        <h3 class="ofx-section-title">Team Members</h3>
        <div class="mt-4">
          <app-project-member-manager [project]="project()"></app-project-member-manager>
        </div>
      </section>

      <hr class="border-white/10" />

      <!-- Google Tasks Integration - Complete Overhaul -->
      <section class="ofx-settings-section">
        <div class="flex items-center justify-between mb-4">
          <h3 class="ofx-section-title flex items-center gap-2">
            <svg viewBox="0 0 24 24" class="h-5 w-5 text-blue-400" fill="currentColor">
              <path
                d="M22 5.18L10.59 16.6l-4.24-4.24 1.41-1.41 2.83 2.83 10-10L22 5.18zM19.79 7.79l-1.41 1.41L22 12.59V19c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2h11.41l2 2H4v14h16V7.79z"
              />
            </svg>
            Google Tasks Sync
          </h3>
          @if (googleTasksAuthenticated()) {
            <span
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
            >
              <span class="h-2 w-2 rounded-full bg-emerald-400"></span>
              Connected
            </span>
          } @else {
            <span
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30"
            >
              <span class="h-2 w-2 rounded-full bg-amber-400"></span>
              Not Connected
            </span>
          }
        </div>

        <div class="space-y-4">
          @if (!googleTasksAuthenticated()) {
            <div
              class="p-6 bg-gradient-to-br from-slate-800/60 to-slate-900/60 rounded-xl border border-blue-500/20 text-center"
            >
              <div
                class="w-14 h-14 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center"
              >
                <svg viewBox="0 0 24 24" class="h-7 w-7 text-blue-400" fill="currentColor">
                  <path
                    d="M22 5.18L10.59 16.6l-4.24-4.24 1.41-1.41 2.83 2.83 10-10L22 5.18zM19.79 7.79l-1.41 1.41L22 12.59V19c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2h11.41l2 2H4v14h16V7.79z"
                  />
                </svg>
              </div>
              <h4 class="text-lg font-semibold text-white mb-2">Connect Google Tasks</h4>
              <p class="text-sm text-slate-400 mb-5 max-w-xs mx-auto">
                Sync your tasks bidirectionally. Changes in either app will sync automatically.
              </p>
              <button class="ofx-neon-button" (click)="reconnectGoogleTasks()">
                Sign In to Connect
              </button>
            </div>
          } @else {
            <!-- Current Linked List Card -->
            <div
              class="p-5 bg-gradient-to-br from-slate-800/80 to-slate-900/60 rounded-xl border border-purple-500/20"
            >
              <div class="flex items-start justify-between mb-3">
                <div>
                  <p class="text-xs uppercase tracking-wider text-slate-500 mb-1">
                    Linked Task List
                  </p>
                  @if (project().googleTaskListId && currentLinkedListName()) {
                    <p class="text-lg font-semibold text-white flex items-center gap-2">
                      <svg viewBox="0 0 24 24" class="h-5 w-5 text-blue-400" fill="currentColor">
                        <path
                          d="M22 5.18L10.59 16.6l-4.24-4.24 1.41-1.41 2.83 2.83 10-10L22 5.18zM19.79 7.79l-1.41 1.41L22 12.59V19c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2h11.41l2 2H4v14h16V7.79z"
                        />
                      </svg>
                      {{ currentLinkedListName() }}
                    </p>
                  } @else {
                    <p class="text-base text-slate-400 italic">No list selected</p>
                  }
                </div>
                <button
                  class="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/10 transition-all"
                  (click)="showListSelector.set(!showListSelector())"
                >
                  {{
                    showListSelector() ? 'Cancel' : project().googleTaskListId ? 'Change' : 'Select'
                  }}
                </button>
              </div>

              @if (showListSelector()) {
                <div class="mt-3 p-3 bg-slate-900/50 rounded-lg border border-white/10">
                  @if (loadingTaskLists()) {
                    <div class="flex items-center gap-2 py-2 text-slate-400 text-sm">
                      <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle
                          class="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          stroke-width="4"
                          fill="none"
                        ></circle>
                        <path
                          class="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        ></path>
                      </svg>
                      Loading...
                    </div>
                  } @else if (googleTaskLists().length === 0) {
                    <div class="text-center py-3">
                      <p class="text-sm text-slate-500 mb-2">No lists found</p>
                      <button
                        class="text-xs text-cyan-400 hover:text-cyan-300"
                        (click)="loadGoogleTaskLists()"
                      >
                        Refresh
                      </button>
                    </div>
                  } @else {
                    <p class="text-xs text-slate-500 mb-2">
                      Click to select for sync, or use 👁 to preview first
                    </p>
                    <div class="space-y-1 max-h-64 overflow-y-auto">
                      @for (list of googleTaskLists(); track list.id) {
                        <div class="flex items-center gap-1 group">
                          <button
                            class="flex-1 text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-between"
                            [class.bg-purple-500/20]="project().googleTaskListId === list.id"
                            [class.text-purple-300]="project().googleTaskListId === list.id"
                            [class.border]="project().googleTaskListId === list.id"
                            [class.border-purple-500/30]="project().googleTaskListId === list.id"
                            [class.text-slate-300]="project().googleTaskListId !== list.id"
                            [class.hover:bg-white/5]="project().googleTaskListId !== list.id"
                            (click)="selectTaskList(list.id)"
                          >
                            <span class="flex items-center gap-2">
                              @if (project().googleTaskListId === list.id) {
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  class="h-4 w-4 text-purple-400 flex-shrink-0"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path
                                    fill-rule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clip-rule="evenodd"
                                  />
                                </svg>
                              }
                              {{ list.title }}
                            </span>
                            @if (project().googleTaskListId === list.id) {
                              <span class="text-xs text-purple-400/70">synced</span>
                            }
                          </button>
                          <!-- Preview button -->
                          <button
                            class="p-2 text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-all opacity-50 group-hover:opacity-100"
                            [class.opacity-100]="previewingListId() === list.id"
                            [class.text-cyan-400]="previewingListId() === list.id"
                            [class.bg-cyan-500/10]="previewingListId() === list.id"
                            title="Preview tasks in this list"
                            (click)="previewList(list.id, list.title); $event.stopPropagation()"
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
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                          </button>
                        </div>
                      }
                    </div>

                    <!-- Preview Panel (shows when previewing a list) -->
                    @if (previewingListId()) {
                      <div class="mt-3 p-3 bg-cyan-500/5 rounded-lg border border-cyan-500/20">
                        <div class="flex items-center justify-between mb-2">
                          <h6 class="text-xs font-semibold text-cyan-400 flex items-center gap-1">
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
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                            </svg>
                            Preview: {{ previewingListName() }}
                          </h6>
                          <button
                            class="text-xs text-slate-500 hover:text-slate-300"
                            (click)="closePreview()"
                          >
                            ✕ Close
                          </button>
                        </div>

                        @if (loadingPreview()) {
                          <div class="flex items-center justify-center py-4 text-slate-400 text-sm">
                            <svg class="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                              <circle
                                class="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                stroke-width="4"
                                fill="none"
                              ></circle>
                              <path
                                class="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                              ></path>
                            </svg>
                            Loading...
                          </div>
                        } @else if (previewTasks().length === 0) {
                          <p class="text-xs text-slate-500 text-center py-3">
                            No tasks in this list
                          </p>
                        } @else {
                          <div class="space-y-1 max-h-40 overflow-y-auto">
                            @for (task of previewTasks(); track task.id) {
                              <div
                                class="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-white/5"
                              >
                                <div
                                  class="mt-0.5 w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center"
                                  [class.border-emerald-400]="task.status === 'completed'"
                                  [class.bg-emerald-400]="task.status === 'completed'"
                                  [class.border-slate-500]="task.status !== 'completed'"
                                >
                                  @if (task.status === 'completed') {
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      class="h-2 w-2 text-white"
                                      viewBox="0 0 20 20"
                                      fill="currentColor"
                                    >
                                      <path
                                        fill-rule="evenodd"
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                        clip-rule="evenodd"
                                      />
                                    </svg>
                                  }
                                </div>
                                <span
                                  class="text-xs flex-1 truncate"
                                  [class.text-slate-500]="task.status === 'completed'"
                                  [class.line-through]="task.status === 'completed'"
                                  [class.text-slate-300]="task.status !== 'completed'"
                                  >{{ task.title }}</span
                                >
                              </div>
                            }
                          </div>
                          <p class="text-xs text-slate-500 mt-2 pt-2 border-t border-white/5">
                            {{ previewTasks().length }} tasks
                          </p>
                        }
                      </div>
                    }
                  }
                </div>
              }
            </div>

            @if (project().googleTaskListId) {
              <!-- Scheduled Sync Toggle -->
              <div
                class="p-4 bg-gradient-to-br from-slate-800/60 to-slate-900/60 rounded-xl border border-indigo-500/20"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div
                      class="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 text-indigo-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <div>
                      <h4 class="text-sm font-semibold text-white">Scheduled Sync</h4>
                      <p class="text-xs text-slate-400">Auto-sync every 5 minutes in background</p>
                    </div>
                  </div>
                  @if (hasOfflineAccess()) {
                    <span
                      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    >
                      <span class="h-2 w-2 rounded-full bg-emerald-400"></span>
                      Enabled
                    </span>
                  } @else {
                    <button
                      class="px-3 py-1.5 text-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg hover:bg-indigo-500/30 transition-all"
                      [disabled]="enablingScheduledSync()"
                      (click)="enableScheduledSync()"
                    >
                      {{ enablingScheduledSync() ? 'Enabling...' : 'Enable' }}
                    </button>
                  }
                </div>
                @if (!hasOfflineAccess()) {
                  <p class="text-xs text-slate-500 mt-3 pl-13">
                    Requires additional Google permissions for background sync.
                  </p>
                }
              </div>

              <!-- Sync Status Card -->
              <div
                class="p-5 bg-gradient-to-br from-slate-800/60 to-slate-900/60 rounded-xl border border-cyan-500/20"
              >
                <div class="flex items-center justify-between mb-4">
                  <h4 class="text-sm font-semibold text-white">Sync Status</h4>
                  <span
                    class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border"
                    [class.bg-emerald-500/20]="project().syncStatus === 'synced'"
                    [class.text-emerald-400]="project().syncStatus === 'synced'"
                    [class.border-emerald-500/30]="project().syncStatus === 'synced'"
                    [class.bg-amber-500/20]="syncing()"
                    [class.text-amber-400]="syncing()"
                    [class.border-amber-500/30]="syncing()"
                    [class.bg-rose-500/20]="project().syncStatus === 'error'"
                    [class.text-rose-400]="project().syncStatus === 'error'"
                    [class.border-rose-500/30]="project().syncStatus === 'error'"
                    [class.bg-slate-600/30]="!project().syncStatus && !syncing()"
                    [class.text-slate-400]="!project().syncStatus && !syncing()"
                    [class.border-slate-500/30]="!project().syncStatus && !syncing()"
                  >
                    @if (syncing()) {
                      <svg class="animate-spin h-3 w-3" viewBox="0 0 24 24">
                        <circle
                          class="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          stroke-width="4"
                          fill="none"
                        ></circle>
                        <path
                          class="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        ></path>
                      </svg>
                      Syncing...
                    } @else if (project().syncStatus === 'synced') {
                      ✓ In Sync
                    } @else if (project().syncStatus === 'error') {
                      ✗ Error
                    } @else {
                      Ready
                    }
                  </span>
                </div>

                <div class="grid grid-cols-2 gap-3 mb-4">
                  <div class="p-3 bg-slate-900/50 rounded-lg">
                    <p class="text-xs text-slate-500 mb-1">Last Synced</p>
                    <p class="text-sm font-medium text-white">
                      {{ project().lastSyncAt ? formatSyncDate(project().lastSyncAt) : 'Never' }}
                    </p>
                  </div>
                  <div class="p-3 bg-slate-900/50 rounded-lg">
                    <p class="text-xs text-slate-500 mb-1">Mode</p>
                    <p class="text-sm font-medium text-cyan-400">↔ Bidirectional</p>
                  </div>
                </div>

                @if (lastSyncResult()) {
                  <div
                    class="mb-4 p-3 rounded-lg text-sm border"
                    [class.bg-emerald-500/10]="lastSyncResult()!.success"
                    [class.text-emerald-400]="lastSyncResult()!.success"
                    [class.border-emerald-500/20]="lastSyncResult()!.success"
                    [class.bg-rose-500/10]="!lastSyncResult()!.success"
                    [class.text-rose-400]="!lastSyncResult()!.success"
                    [class.border-rose-500/20]="!lastSyncResult()!.success"
                  >
                    {{ lastSyncResult()!.message }}
                  </div>
                }

                <div class="flex items-center gap-2">
                  <button
                    class="flex-1 ofx-neon-button !py-2.5 flex items-center justify-center gap-2"
                    [disabled]="syncing()"
                    (click)="triggerSync()"
                  >
                    <svg
                      class="h-4 w-4 flex-shrink-0"
                      [class.animate-spin]="syncing()"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    <span>{{ syncing() ? 'Syncing...' : 'Sync Now' }}</span>
                  </button>
                  <button
                    class="p-2.5 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg border border-white/10 transition-all"
                    title="Preview Google Tasks"
                    (click)="toggleTaskPreview()"
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
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  </button>
                  <button
                    class="p-2.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg border border-white/10 transition-all"
                    title="Disconnect"
                    (click)="disconnectGoogleTasks()"
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
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                  </button>
                </div>

                <!-- Google Tasks Preview -->
                @if (showTaskPreview()) {
                  <div class="mt-4 p-4 bg-slate-900/70 rounded-xl border border-cyan-500/20">
                    <div class="flex items-center justify-between mb-3">
                      <h5 class="text-sm font-semibold text-white flex items-center gap-2">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-4 w-4 text-cyan-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                          />
                        </svg>
                        Google Tasks Preview
                      </h5>
                      <button
                        class="text-xs text-cyan-400 hover:text-cyan-300"
                        [disabled]="loadingPreview()"
                        (click)="loadTaskPreview()"
                      >
                        {{ loadingPreview() ? 'Loading...' : 'Refresh' }}
                      </button>
                    </div>

                    @if (loadingPreview()) {
                      <div class="flex items-center justify-center py-6 text-slate-400">
                        <svg class="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                          <circle
                            class="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            stroke-width="4"
                            fill="none"
                          ></circle>
                          <path
                            class="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          ></path>
                        </svg>
                        Loading tasks...
                      </div>
                    } @else if (previewTasks().length === 0) {
                      <p class="text-sm text-slate-500 text-center py-4">
                        No tasks found in this list
                      </p>
                    } @else {
                      <div class="space-y-1 max-h-64 overflow-y-auto">
                        @for (task of previewTasks(); track task.id) {
                          <div
                            class="flex items-start gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors"
                          >
                            <div
                              class="mt-0.5 w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center"
                              [class.border-emerald-400]="task.status === 'completed'"
                              [class.bg-emerald-400]="task.status === 'completed'"
                              [class.border-slate-500]="task.status !== 'completed'"
                            >
                              @if (task.status === 'completed') {
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  class="h-2.5 w-2.5 text-white"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <path
                                    fill-rule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clip-rule="evenodd"
                                  />
                                </svg>
                              }
                            </div>
                            <div class="flex-1 min-w-0">
                              <p
                                class="text-sm truncate"
                                [class.text-slate-400]="task.status === 'completed'"
                                [class.line-through]="task.status === 'completed'"
                                [class.text-white]="task.status !== 'completed'"
                              >
                                {{ task.title }}
                              </p>
                              @if (task.due) {
                                <p class="text-xs text-slate-500">
                                  Due: {{ formatPreviewDate(task.due) }}
                                </p>
                              }
                            </div>
                          </div>
                        }
                      </div>
                      <p class="text-xs text-slate-500 mt-2 pt-2 border-t border-white/5">
                        {{ previewTasks().length }} tasks in "{{ currentLinkedListName() }}"
                      </p>
                    }
                  </div>
                }
              </div>
            } @else {
              <div
                class="p-5 bg-slate-800/30 rounded-xl border border-dashed border-purple-500/30 text-center"
              >
                <p class="text-sm text-slate-400 mb-2">Select a task list to start syncing</p>
                <button
                  class="text-sm text-purple-400 hover:text-purple-300"
                  (click)="showListSelector.set(true)"
                >
                  Select List →
                </button>
              </div>
            }
          }
        </div>
      </section>

      <hr class="border-white/10" />

      <!-- Danger Zone -->
      <section class="ofx-settings-section">
        <h3 class="text-sm font-semibold text-rose-400 mb-4">Danger Zone</h3>

        <div class="space-y-3">
          <!-- Archive/Restore -->
          @if (project().status === 'active') {
            <button
              class="w-full flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 hover:bg-amber-500/20 transition-colors"
              (click)="toggleArchive()"
            >
              <span class="flex items-center gap-2">
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
                    d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                  />
                </svg>
                Archive Project
              </span>
              <span class="text-xs text-amber-500/70">Hide from active projects</span>
            </button>
          } @else {
            <button
              class="w-full flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 hover:bg-emerald-500/20 transition-colors"
              (click)="toggleArchive()"
            >
              <span class="flex items-center gap-2">
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
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Restore Project
              </span>
              <span class="text-xs text-emerald-500/70">Make project active again</span>
            </button>
          }

          <!-- Delete -->
          <button
            class="w-full flex items-center justify-between p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 hover:bg-rose-500/20 transition-colors"
            (click)="confirmDelete()"
          >
            <span class="flex items-center gap-2">
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
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Delete Project
            </span>
            <span class="text-xs text-rose-500/70">Permanently remove project and all tasks</span>
          </button>
        </div>
      </section>
    </div>
  `,
  styles: [
    `
      .ofx-settings-section {
        /* Section styling handled by parent */
      }

      .ofx-section-title {
        font-size: 0.875rem;
        font-weight: 600;
        color: rgb(203, 213, 225);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
    `,
  ],
})
export class ProjectSettingsPanelComponent {
  private projectService = inject(ProjectService);
  private dialogService = inject(DialogService);
  private googleTasksService = inject(GoogleTasksService);
  private googleTasksSyncService = inject(GoogleTasksSyncService);
  private authService = inject(AuthService);

  project = input.required<Project>();
  projectChanged = output<void>();
  projectDeleted = output<void>();

  colors = PROJECT_COLORS;

  // Edit state
  editName = '';
  editDescription = '';
  saving = signal(false);

  hasBasicChanges = signal(false);

  // Google Tasks state
  googleTasksAuthenticated = computed(() => this.googleTasksService.isAuthenticated());
  googleTaskLists = signal<GoogleTaskList[]>([]);
  loadingTaskLists = signal(false);
  syncing = signal(false);
  lastSyncResult = signal<{ success: boolean; message: string } | null>(null);
  showListSelector = signal(false); // Control dropdown visibility

  // Preview state
  showTaskPreview = signal(false);
  loadingPreview = signal(false);
  previewTasks = signal<GoogleTask[]>([]);
  previewingListId = signal<string | null>(null); // Which list is being previewed
  previewingListName = signal<string | null>(null); // Name of list being previewed

  // Scheduled sync state
  hasOfflineAccess = computed(() => this.authService.hasOfflineAccess());
  enablingScheduledSync = signal(false);

  // Computed: Get current linked list name
  currentLinkedListName = computed(() => {
    const listId = this.project().googleTaskListId;
    if (!listId) return null;
    const list = this.googleTaskLists().find((l) => l.id === listId);
    return list?.title || 'Unknown List';
  });

  ngOnInit() {
    this.resetBasicInfo();
    // Load task lists if sync is already enabled
    this.initGoogleTaskLists();
  }

  ngOnChanges() {
    // Reset when project changes
    this.resetBasicInfo();
    // Reload task lists if sync is enabled for this project
    this.initGoogleTaskLists();
  }

  private async initGoogleTaskLists() {
    // Always load task lists when authenticated, so user can select one
    if (this.googleTasksAuthenticated()) {
      await this.loadGoogleTaskLists();
    }
  }

  resetBasicInfo() {
    this.editName = this.project().name;
    this.editDescription = this.project().description || '';
    this.hasBasicChanges.set(false);
  }

  onNameChange(event: Event) {
    this.editName = (event.target as HTMLInputElement).value;
    this.checkBasicChanges();
  }

  onDescriptionChange(event: Event) {
    this.editDescription = (event.target as HTMLTextAreaElement).value;
    this.checkBasicChanges();
  }

  checkBasicChanges() {
    const hasChanges =
      this.editName !== this.project().name ||
      this.editDescription !== (this.project().description || '');
    this.hasBasicChanges.set(hasChanges);
  }

  async updateColor(color: string) {
    try {
      await this.projectService.updateProject(this.project().id, { color });
      this.projectChanged.emit();
    } catch (error) {
      console.error('Failed to update color:', error);
    }
  }

  async saveBasicInfo() {
    if (!this.editName.trim()) return;

    this.saving.set(true);
    try {
      await this.projectService.updateProject(this.project().id, {
        name: this.editName.trim(),
        description: this.editDescription.trim(),
      });
      this.hasBasicChanges.set(false);
      this.projectChanged.emit();
    } catch (error) {
      console.error('Failed to save project:', error);
    } finally {
      this.saving.set(false);
    }
  }

  getOwnerInitial(): string {
    return this.project().ownerId?.charAt(0)?.toUpperCase() || 'O';
  }

  async toggleArchive() {
    const project = this.project();
    const action = project.status === 'active' ? 'archive' : 'restore';

    if (
      await this.dialogService.confirm(
        `Are you sure you want to ${action} this project?`,
        `${action === 'archive' ? 'Archive' : 'Restore'} Project`,
      )
    ) {
      try {
        if (project.status === 'active') {
          await this.projectService.archiveProject(project.id);
        } else {
          await this.projectService.restoreProject(project.id);
        }
        this.projectChanged.emit();
      } catch (error) {
        console.error(`Failed to ${action} project:`, error);
      }
    }
  }

  async confirmDelete() {
    const confirmed = await this.dialogService.confirm(
      `Are you sure you want to DELETE "${
        this.project().name
      }"?\n\nThis will permanently remove the project and ALL its tasks. This action cannot be undone.`,
      'Delete Project',
    );

    if (confirmed) {
      try {
        await this.projectService.deleteProject(this.project().id);
        this.projectDeleted.emit();
      } catch (error) {
        console.error('Failed to delete project:', error);
      }
    }
  }

  // Google Tasks Methods

  async toggleSyncEnabled() {
    const newValue = !this.project().syncEnabled;
    try {
      // Build update object without undefined values (Firestore rejects undefined)
      const updateData: Record<string, any> = { syncEnabled: newValue };
      if (newValue) {
        updateData['syncStatus'] = 'pending';
      } else {
        updateData['syncStatus'] = null;
        updateData['googleTaskListId'] = null;
      }

      await this.projectService.updateProject(this.project().id, updateData);
      this.projectChanged.emit();

      // Load task lists when enabling sync
      if (newValue && this.googleTasksAuthenticated()) {
        await this.loadGoogleTaskLists();
      }
    } catch (error) {
      console.error('Failed to toggle sync:', error);
    }
  }

  async loadGoogleTaskLists() {
    if (!this.googleTasksAuthenticated()) return;

    this.loadingTaskLists.set(true);
    try {
      const response = await firstValueFrom(this.googleTasksService.getTaskLists());
      this.googleTaskLists.set(response.items || []);
    } catch (error) {
      console.error('Failed to load Google Task lists:', error);
      this.googleTaskLists.set([]);
    } finally {
      this.loadingTaskLists.set(false);
    }
  }

  async selectTaskList(listId: string) {
    try {
      await this.projectService.updateProject(this.project().id, {
        googleTaskListId: listId,
        syncEnabled: true,
        syncStatus: 'pending',
      });
      this.projectChanged.emit();
      this.showListSelector.set(false); // Hide selector after selection
      this.closePreview(); // Close any open preview
    } catch (error) {
      console.error('Failed to select task list:', error);
    }
  }

  async previewList(listId: string, listName: string) {
    // Toggle off if already previewing this list
    if (this.previewingListId() === listId) {
      this.closePreview();
      return;
    }

    this.previewingListId.set(listId);
    this.previewingListName.set(listName);
    this.loadingPreview.set(true);
    this.previewTasks.set([]);

    try {
      const response = await firstValueFrom(this.googleTasksService.getTasks(listId));
      this.previewTasks.set(response.items || []);
    } catch (error) {
      console.error('Failed to load preview:', error);
      this.previewTasks.set([]);
    } finally {
      this.loadingPreview.set(false);
    }
  }

  closePreview() {
    this.previewingListId.set(null);
    this.previewingListName.set(null);
    this.previewTasks.set([]);
  }

  async onTaskListChange(event: Event) {
    const taskListId = (event.target as HTMLSelectElement).value;
    try {
      // Build update object without undefined values (Firestore rejects undefined)
      const updateData: Record<string, any> = {};
      if (taskListId) {
        updateData['googleTaskListId'] = taskListId;
        updateData['syncStatus'] = 'pending';
      } else {
        // Use deleteField() or null to clear the field
        updateData['googleTaskListId'] = null;
        updateData['syncStatus'] = null;
      }
      await this.projectService.updateProject(this.project().id, updateData);
      this.projectChanged.emit();
    } catch (error) {
      console.error('Failed to update task list:', error);
    }
  }

  async triggerSync() {
    if (!this.project().googleTaskListId) {
      await this.dialogService.alert('Please select a Google Task list first.', 'Sync Required');
      return;
    }

    this.syncing.set(true);
    try {
      // Update sync status to pending
      await this.projectService.updateProject(this.project().id, { syncStatus: 'pending' });
      this.projectChanged.emit();

      // Get the last sync timestamp to only fetch updated tasks
      const lastSyncAt = this.project().lastSyncAt;
      const lastSyncDate = lastSyncAt
        ? lastSyncAt instanceof Date
          ? lastSyncAt
          : (lastSyncAt as any).toDate?.() || new Date(0)
        : undefined;

      // Pull tasks from Google Tasks to OmniTask (reverse sync)
      const result = await this.googleTasksSyncService.pullFromGoogleTasks(
        this.project().id,
        this.project().googleTaskListId!,
        lastSyncDate,
      );

      console.log(`Sync complete: ${result.added} added, ${result.updated} updated`);

      // Mark as synced and show result
      await this.projectService.updateProject(this.project().id, {
        syncStatus: 'synced',
        lastSyncAt: new Date(),
      });
      this.projectChanged.emit();

      // Show success feedback
      this.lastSyncResult.set({
        success: true,
        message: `✓ ${result.added} added, ${result.updated} updated, ${result.pushed} synced to Google`,
      });

      // Clear the message after 5 seconds
      setTimeout(() => this.lastSyncResult.set(null), 5000);
    } catch (error) {
      console.error('Sync failed:', error);
      await this.projectService.updateProject(this.project().id, { syncStatus: 'error' });

      // Show error feedback
      this.lastSyncResult.set({
        success: false,
        message: 'Sync failed. Please check your connection and try again.',
      });
    } finally {
      this.syncing.set(false);
    }
  }

  formatSyncDate(date: Date | { toDate: () => Date } | null | undefined): string {
    if (!date) return 'Never';
    const d =
      date instanceof Date ? date : ((date as { toDate?: () => Date }).toDate?.() ?? new Date());
    return d.toLocaleString();
  }

  async reconnectGoogleTasks() {
    // Sign out will clear the token, forcing re-authentication with Tasks scope
    await this.authService.logout();
  }

  async disconnectGoogleTasks() {
    const confirmed = await this.dialogService.confirm(
      'This will disconnect Google Tasks from this project. Your tasks will remain, but sync will stop.',
      'Disconnect Google Tasks?',
    );
    if (confirmed) {
      try {
        await this.projectService.updateProject(this.project().id, {
          syncEnabled: false,
          googleTaskListId: null as any,
          syncStatus: null as any,
        } as any);
        this.projectChanged.emit();
        this.googleTaskLists.set([]);
      } catch (error) {
        console.error('Failed to disconnect:', error);
      }
    }
  }

  toggleTaskPreview() {
    const wasOpen = this.showTaskPreview();
    this.showTaskPreview.set(!wasOpen);

    // Auto-load when opening
    if (!wasOpen) {
      this.loadTaskPreview();
    }
  }

  async loadTaskPreview() {
    const listId = this.project().googleTaskListId;
    if (!listId || !this.googleTasksAuthenticated()) return;

    this.loadingPreview.set(true);
    try {
      const response = await firstValueFrom(this.googleTasksService.getTasks(listId));
      this.previewTasks.set(response.items || []);
    } catch (error) {
      console.error('Failed to load task preview:', error);
      this.previewTasks.set([]);
    } finally {
      this.loadingPreview.set(false);
    }
  }

  formatPreviewDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  /**
   * Enable scheduled sync by requesting offline access from Google.
   * This allows Cloud Functions to sync tasks in the background.
   */
  async enableScheduledSync() {
    this.enablingScheduledSync.set(true);
    try {
      const success = await this.authService.requestOfflineAccess();
      if (success) {
        this.lastSyncResult.set({
          success: true,
          message: 'Scheduled sync enabled! Tasks will sync automatically every 5 minutes.',
        });
        setTimeout(() => this.lastSyncResult.set(null), 5000);
      }
    } catch (error) {
      console.error('Failed to enable scheduled sync:', error);
      this.lastSyncResult.set({
        success: false,
        message: 'Failed to enable scheduled sync. Please try again.',
      });
    } finally {
      this.enablingScheduledSync.set(false);
    }
  }
}

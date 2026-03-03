import { Component, input, output, computed, signal, inject, ChangeDetectionStrategy } from '@angular/core';
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
import { MarkdownPipe, MarkdownPlainPipe } from '../../shared/pipes/markdown.pipe';
import {
  ColumnSettingsMenuComponent,
  ColumnDisplaySettings,
} from './column-settings-menu.component';
import { OverlayModule } from '@angular/cdk/overlay';

@Component({
  selector: 'app-task-board-view',
  standalone: true,
  imports: [
    CommonModule,
    DragDropModule,
    MarkdownPipe,
    MarkdownPlainPipe,
    ColumnSettingsMenuComponent,
    OverlayModule,
  ],
  template: `
    <div class="h-full flex flex-col overflow-hidden">
      <!-- Filter Bar -->
      <div
        class="flex items-center justify-between px-4 py-2 bg-slate-900/60 border-b border-white/5 flex-shrink-0"
      >
        <div class="flex items-center gap-3">
          @if (selectionMode()) {
            <span class="text-xs text-purple-400 font-medium">
              {{ selectedTaskIds().size }} selected
            </span>
            @if (selectedTaskIds().size > 0) {
              <button
                class="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                (click)="clearSelection()"
              >
                Clear
              </button>
            }
          } @else {
            <span class="text-xs text-slate-400"> {{ visibleTaskCount() }} tasks </span>
            @if (hiddenCompletedCount() > 0) {
              <span class="text-xs text-slate-500">
                ({{ hiddenCompletedCount() }} completed hidden)
              </span>
            }
          }
        </div>

        <div class="flex items-center gap-2">
          <!-- Selection Mode Toggle -->
          <button
            class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border"
            [class.bg-purple-500/20]="selectionMode()"
            [class.text-purple-400]="selectionMode()"
            [class.border-purple-500/30]="selectionMode()"
            [class.bg-slate-800/50]="!selectionMode()"
            [class.text-slate-400]="!selectionMode()"
            [class.border-slate-600/30]="!selectionMode()"
            (click)="toggleSelectionMode()"
            title="Toggle selection mode for bulk actions"
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
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
            {{ selectionMode() ? 'Exit Select' : 'Select' }}
          </button>

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

          <!-- View Mode Toggle -->
          <div class="flex items-center bg-slate-800/60 rounded-lg border border-white/5 p-0.5">
            <button
              class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
              [class.bg-cyan-500/20]="viewMode() === 'simplified'"
              [class.text-cyan-400]="viewMode() === 'simplified'"
              [class.text-slate-500]="viewMode() !== 'simplified'"
              (click)="viewMode.set('simplified')"
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
                  d="M4 6h16M4 12h16M4 18h7"
                />
              </svg>
              Simple
            </button>
            <button
              class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
              [class.bg-purple-500/20]="viewMode() === 'detailed'"
              [class.text-purple-400]="viewMode() === 'detailed'"
              [class.text-slate-500]="viewMode() !== 'detailed'"
              (click)="viewMode.set('detailed')"
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
                  d="M4 6h16M4 10h16M4 14h16M4 18h16"
                />
              </svg>
              Detailed
            </button>
          </div>
        </div>
      </div>

      <!-- Bulk Actions Bar (shown when tasks are selected) -->
      @if (selectionMode() && selectedTaskIds().size > 0) {
        <div
          class="flex items-center justify-between px-4 py-2 bg-purple-500/10 border-b border-purple-500/20 flex-shrink-0"
        >
          <div class="flex items-center gap-2">
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all"
              (click)="bulkComplete()"
              title="Mark selected tasks as complete"
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
              Complete ({{ selectedTaskIds().size }})
            </button>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-all"
              (click)="bulkReopen()"
              title="Reopen selected tasks"
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
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Reopen
            </button>
          </div>
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-all"
            (click)="selectAllVisible()"
          >
            {{ allVisibleSelected() ? 'Deselect All' : 'Select All' }}
          </button>
        </div>
      }

      <div class="flex-1 overflow-x-auto overflow-y-hidden">
        <div
          cdkDropList
          cdkDropListOrientation="horizontal"
          [cdkDropListData]="projectSections()"
          (cdkDropListDropped)="onColumnDrop($event)"
          class="h-full flex gap-6 pb-4 min-w-max p-4"
        >
          @for (section of projectSections(); track section.id) {
            <div
              cdkDrag
              [cdkDragData]="section"
              class="board-column flex flex-col rounded-xl border h-full max-h-full transition-all duration-300"
              [class.bg-slate-900/40]="getSectionStatus(section) !== 'done'"
              [class.bg-slate-900/20]="getSectionStatus(section) === 'done'"
              [class.border-white/5]="getSectionStatus(section) === 'done'"
              [class.opacity-75]="getSectionStatus(section) === 'done'"
              [class.cyber-column-done]="getSectionStatus(section) === 'done'"
              [style.border-color]="
                getSectionStatus(section) !== 'done' ? getColorWithOpacity(section.color, 0.2) : ''
              "
              [style.box-shadow]="
                getSectionStatus(section) !== 'done'
                  ? '0 0 20px ' +
                    getColorWithOpacity(section.color, 0.1) +
                    ', inset 0 0 20px ' +
                    getColorWithOpacity(section.color, 0.05)
                  : ''
              "
              [style.animation]="
                getSectionStatus(section) === 'in-progress'
                  ? 'pulse-progress 3s ease-in-out infinite'
                  : ''
              "
            >
              <!-- Column drag placeholder -->
              <div
                *cdkDragPlaceholder
                class="board-column-placeholder bg-slate-800/30 border-2 border-dashed border-purple-500/40 rounded-xl h-full min-h-[200px]"
              ></div>

              <!-- Column Header -->
              <div
                cdkDragHandle
                class="p-4 flex items-center justify-between border-b cursor-grab active:cursor-grabbing relative"
                [class.border-white/10]="getSectionStatus(section) === 'done'"
                [class.border-white/10]="getSectionStatus(section) !== 'done'"
              >
                <!-- Neon glow effect for active columns -->
                @if (getSectionStatus(section) !== 'done') {
                  <div
                    class="absolute inset-0 opacity-10 pointer-events-none"
                    [style.background]="
                      'linear-gradient(135deg, ' +
                      getColorWithOpacity(section.color, 0.2) +
                      ', transparent)'
                    "
                  ></div>
                }

                <div class="flex items-center gap-3 relative z-10">
                  <span
                    class="w-3 h-3 rounded-full transition-all duration-300"
                    [style.background]="section.color || '#64748b'"
                    [style.box-shadow]="
                      getSectionStatus(section) !== 'done'
                        ? '0 0 12px ' +
                          getColorWithOpacity(section.color, 0.5) +
                          ', 0 0 20px ' +
                          getColorWithOpacity(section.color, 0.25)
                        : 'none'
                    "
                    [class.animate-pulse]="getSectionStatus(section) === 'in-progress'"
                  ></span>
                  <h3
                    class="font-bold text-sm tracking-wide transition-colors duration-300"
                    [class.text-slate-200]="getSectionStatus(section) !== 'done'"
                    [class.text-slate-500]="getSectionStatus(section) === 'done'"
                    [style.text-shadow]="
                      getSectionStatus(section) !== 'done'
                        ? '0 0 8px ' + getColorWithOpacity(section.color, 0.6)
                        : 'none'
                    "
                  >
                    {{ section.name }}
                  </h3>
                  @if (getColumnSettings(section.id).showTaskCount) {
                    <span
                      class="text-xs px-2 py-0.5 rounded-full transition-colors duration-300"
                      [class.bg-white/5]="getSectionStatus(section) === 'done'"
                      [class.text-slate-500]="getSectionStatus(section) === 'done'"
                      [class.text-slate-400]="
                        getSectionStatus(section) !== 'done' && !isOverWipLimit(section.id)
                      "
                      [class.bg-amber-500/30]="isOverWipLimit(section.id)"
                      [class.text-amber-300]="isOverWipLimit(section.id)"
                      [class.border-amber-500/40]="isOverWipLimit(section.id)"
                      [style.background]="
                        getSectionStatus(section) !== 'done' && !isOverWipLimit(section.id)
                          ? getColorWithOpacity(section.color, 0.2)
                          : ''
                      "
                      [style.color]="
                        getSectionStatus(section) !== 'done' && !isOverWipLimit(section.id)
                          ? section.color || '#64748b'
                          : ''
                      "
                      [style.border]="
                        getSectionStatus(section) !== 'done' && !isOverWipLimit(section.id)
                          ? '1px solid ' + getColorWithOpacity(section.color, 0.25)
                          : ''
                      "
                      [title]="
                        isOverWipLimit(section.id)
                          ? 'Over WIP limit (' + getColumnSettings(section.id).taskLimit + ')'
                          : ''
                      "
                    >
                      {{ getFilteredTasksForSection(section.id).length }}
                      @if (isOverWipLimit(section.id)) {
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="inline-block h-3 w-3 ml-0.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                      }
                    </span>
                  }
                </div>
                <!-- Column Menu Button & Settings -->
                <div class="relative z-10">
                  <button
                    #menuTrigger="cdkOverlayOrigin"
                    cdkOverlayOrigin
                    class="text-slate-500 hover:text-white transition-colors p-1 rounded hover:bg-white/5"
                    (click)="toggleColumnMenu(section.id); $event.stopPropagation()"
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

                  <!-- Column Settings Menu -->
                  <app-column-settings-menu
                    [section]="section"
                    [projectId]="project().id"
                    [isOpen]="openMenuSectionId() === section.id"
                    [sectionIndex]="$index"
                    [totalSections]="projectSections().length"
                    [trigger]="menuTrigger"
                    [columnSettings]="getColumnSettings(section.id)"
                    (close)="closeColumnMenu()"
                    (colorChanged)="handleColorChange($event)"
                    (nameChanged)="handleNameChange($event)"
                    (reorder)="handleReorder($event)"
                    (settingsChanged)="handleSettingsChange($event)"
                    (delete)="handleDeleteSection($event)"
                  />
                </div>
              </div>

              <!-- Task List -->
              <div
                cdkDropList
                [id]="section.id"
                [cdkDropListData]="getTasksForSection(section.id)"
                [cdkDropListConnectedTo]="connectedDropLists()"
                (cdkDropListDropped)="onDrop($event, section.id)"
                [cdkDropListDisabled]="selectionMode()"
                class="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent relative z-0"
              >
                @for (task of getFilteredTasksForSection(section.id); track task.id) {
                  <div
                    cdkDrag
                    [cdkDragData]="task"
                    [cdkDragDisabled]="selectionMode()"
                    class="ofx-task-card rounded-lg border shadow-sm transition-all cursor-pointer group relative overflow-hidden z-0"
                    [class.p-4]="!getColumnSettings(section.id).compactMode"
                    [class.p-2]="getColumnSettings(section.id).compactMode"
                    [class.bg-slate-800]="task.status !== 'done' && !isSelected(task.id)"
                    [class.bg-purple-900/30]="isSelected(task.id)"
                    [class.bg-slate-900/30]="task.status === 'done' && !isSelected(task.id)"
                    [class.border-purple-500/40]="isSelected(task.id)"
                    [class.border-white/5]="task.status === 'done' && !isSelected(task.id)"
                    [class.opacity-50]="task.status === 'done' && !isSelected(task.id)"
                    [class.grayscale]="task.status === 'done' && !isSelected(task.id)"
                    [class.hover:shadow-lg]="task.status !== 'done'"
                    [ngClass]="{
                      'task-todo':
                        getSectionStatus(section) === 'todo' &&
                        task.status !== 'done' &&
                        !isSelected(task.id),
                      'task-progress':
                        getSectionStatus(section) === 'in-progress' &&
                        task.status !== 'done' &&
                        !isSelected(task.id),
                      'task-done': task.status === 'done' && !isSelected(task.id),
                    }"
                    [style.border-color]="
                      isSelected(task.id)
                        ? ''
                        : task.status !== 'done'
                          ? getColorWithOpacity(section.color, 0.3)
                          : ''
                    "
                    (click)="selectionMode() ? toggleTaskSelection(task.id) : taskClick.emit(task)"
                  >
                    <!-- Selection checkbox overlay -->
                    @if (selectionMode()) {
                      <div class="absolute top-2 left-2 z-20" (click)="$event.stopPropagation()">
                        <input
                          type="checkbox"
                          class="w-4 h-4 rounded border-slate-500 bg-slate-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-0 cursor-pointer"
                          [checked]="isSelected(task.id)"
                          (change)="toggleTaskSelection(task.id)"
                        />
                      </div>
                    }

                    <!-- Neon glow effect for active tasks -->
                    @if (task.status !== 'done' && !isSelected(task.id)) {
                      <div
                        class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                        [style.background]="
                          'linear-gradient(135deg, ' +
                          getColorWithOpacity(section.color, 0.1) +
                          ', transparent)'
                        "
                        [style.box-shadow]="
                          '0 0 20px ' +
                          getColorWithOpacity(section.color, 0.2) +
                          ', inset 0 0 20px ' +
                          getColorWithOpacity(section.color, 0.1)
                        "
                      ></div>
                    }

                    <!-- Selection glow effect -->
                    @if (isSelected(task.id)) {
                      <div
                        class="absolute inset-0 pointer-events-none"
                        style="background: linear-gradient(135deg, rgba(168, 85, 247, 0.15), transparent); box-shadow: inset 0 0 20px rgba(168, 85, 247, 0.2);"
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
                        'bg-slate-600': task.status === 'done',
                      }"
                    ></div>

                    <h4
                      class="text-sm font-medium mb-2 pr-4 leading-normal relative z-10 transition-all duration-300"
                      [class.pl-6]="selectionMode()"
                      [class.text-slate-100]="task.status !== 'done'"
                      [class.text-slate-500]="task.status === 'done'"
                      [class.line-through]="task.status === 'done'"
                      [style.text-shadow]="
                        task.status !== 'done'
                          ? '0 0 4px ' + getColorWithOpacity(section.color, 0.2)
                          : 'none'
                      "
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

                    <!-- Description Preview -->
                    @if (task.description) {
                      @if (viewMode() === 'detailed') {
                        <div
                          class="text-[11px] text-slate-400 mt-1.5 mb-1 prose prose-invert prose-xs max-w-none relative z-10 board-preview-content"
                          [innerHTML]="task.description | markdown"
                        ></div>
                      } @else {
                        <div class="text-[11px] text-slate-500 mt-1 line-clamp-2 relative z-10">
                          {{ task.description | markdownPlain: 60 }}
                        </div>
                      }
                    }

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
  styleUrls: ['./task-board-view.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
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

  // View mode toggle
  viewMode = signal<'simplified' | 'detailed'>('simplified');

  // Selection mode for bulk actions
  selectionMode = signal(false);
  selectedTaskIds = signal<Set<string>>(new Set());

  // Track session start time to show recently completed tasks
  private sessionStartTime = new Date();

  // Column settings menu state
  openMenuSectionId = signal<string | null>(null);
  menuTriggerRect = signal<DOMRect | null>(null);
  columnDisplaySettings = signal<Record<string, ColumnDisplaySettings>>({});

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

  // Selection mode methods
  toggleSelectionMode() {
    this.selectionMode.update((v) => !v);
    if (!this.selectionMode()) {
      this.clearSelection();
    }
  }

  toggleTaskSelection(taskId: string) {
    this.selectedTaskIds.update((ids) => {
      const newIds = new Set(ids);
      if (newIds.has(taskId)) {
        newIds.delete(taskId);
      } else {
        newIds.add(taskId);
      }
      return newIds;
    });
  }

  isSelected(taskId: string): boolean {
    return this.selectedTaskIds().has(taskId);
  }

  clearSelection() {
    this.selectedTaskIds.set(new Set());
  }

  selectAllVisible() {
    if (this.allVisibleSelected()) {
      this.clearSelection();
    } else {
      const allIds = new Set<string>();
      for (const section of this.projectSections()) {
        for (const task of this.getFilteredTasksForSection(section.id)) {
          allIds.add(task.id);
        }
      }
      this.selectedTaskIds.set(allIds);
    }
  }

  allVisibleSelected(): boolean {
    const count = this.visibleTaskCount();
    if (count === 0) return false;
    return this.selectedTaskIds().size === count;
  }

  async bulkComplete() {
    const ids = Array.from(this.selectedTaskIds());
    if (ids.length === 0) return;

    await this.taskService.bulkUpdateTasks(ids, {
      status: 'done',
      completedAt: new Date(),
    });
    this.clearSelection();
  }

  async bulkReopen() {
    const ids = Array.from(this.selectedTaskIds());
    if (ids.length === 0) return;

    await this.taskService.bulkUpdateTasks(ids, {
      status: 'todo',
      completedAt: null,
    });
    this.clearSelection();
  }

  private toDate(dateValue: unknown): Date {
    if (dateValue instanceof Date) return dateValue;
    if (dateValue && typeof dateValue === 'object' && 'toDate' in dateValue) {
      return (dateValue as { toDate: () => Date }).toDate();
    }
    return new Date(dateValue as string | number);
  }

  getTasksForSection(sectionId: string) {
    // Filter tasks for this section and sort by order, keeping completed at bottom
    return this.tasks()
      .filter((t) => t.sectionId === sectionId)
      .sort((a, b) => {
        // Keep completed tasks at the bottom for rapid task completion
        const aIsDone = a.status === 'done';
        const bIsDone = b.status === 'done';
        if (aIsDone !== bIsDone) {
          return aIsDone ? 1 : -1;
        }
        return a.order - b.order;
      });
  }

  getFilteredTasksForSection(sectionId: string) {
    const sectionTasks = this.getTasksForSection(sectionId);
    const columnSettings = this.getColumnSettings(sectionId);

    // If global "show completed" is on, show all tasks
    if (this.showCompleted()) {
      return sectionTasks;
    }

    // If column-specific "hide completed" is enabled, filter more aggressively
    if (columnSettings.hideCompletedTasks) {
      return sectionTasks.filter((task) => task.status !== 'done');
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
    // For both same-column and cross-column drops, logic is identical!
    const task = event.item.data as Task;
    this.reorderTask(task, event.currentIndex, targetSectionId, event.container.data);
  }

  private reorderTask(movedTask: Task, newIndex: number, sectionId: string, siblingTasks: Task[]) {
    // Build the complete reordered list with proper indices for ALL tasks in the section
    // This ensures no order collisions occur after drag-drop operations

    // Remove the moved task from its current position (if present)
    const tasksWithoutMoved = siblingTasks.filter((t) => t.id !== movedTask.id);

    // Build the new ordered list by inserting at the target index
    const reorderedList: Task[] = [
      ...tasksWithoutMoved.slice(0, newIndex),
      movedTask, // Insert moved task at new position
      ...tasksWithoutMoved.slice(newIndex),
    ];

    const targetSection = this.projectSections().find((s) => s.id === sectionId);
    const derivedStatus = targetSection ? this.getSectionStatus(targetSection) : undefined;

    // Update ALL tasks in the section with sequential order values.
    // The service's reorderTasks will derive status from the target sectionId
    // via the section's status mapping — no manual status logic needed here.
    const updates = reorderedList.map((task, index) => ({
      id: task.id,
      order: index,
      sectionId,
      status: derivedStatus,
      currentStatus: task.status,
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

  // Column menu methods
  toggleColumnMenu(sectionId: string) {
    if (this.openMenuSectionId() === sectionId) {
      this.openMenuSectionId.set(null);
    } else {
      this.openMenuSectionId.set(sectionId);
    }
  }

  closeColumnMenu() {
    this.openMenuSectionId.set(null);
  }

  // Column drag-and-drop handler
  async onColumnDrop(event: CdkDragDrop<Section[]>) {
    if (event.previousIndex === event.currentIndex) return;

    const sections = [...this.projectSections()];
    moveItemInArray(sections, event.previousIndex, event.currentIndex);

    // Update order values
    const reorderedSections = sections.map((s, index) => ({ ...s, order: index }));
    await this.projectService.reorderSections(this.project().id, reorderedSections);
  }

  private readonly defaultColumnSettings: ColumnDisplaySettings = {
    hideCompletedTasks: false,
    compactMode: false,
    showTaskCount: true,
    taskLimit: null,
  };

  getColumnSettings(sectionId: string): ColumnDisplaySettings {
    return this.columnDisplaySettings()[sectionId] || this.defaultColumnSettings;
  }

  isOverWipLimit(sectionId: string): boolean {
    const settings = this.getColumnSettings(sectionId);
    if (!settings.taskLimit) return false;
    const taskCount = this.getFilteredTasksForSection(sectionId).length;
    return taskCount > settings.taskLimit;
  }

  async handleColorChange(event: { sectionId: string; color: string }) {
    const projectId = this.project().id;
    await this.projectService.updateSection(projectId, event.sectionId, { color: event.color });
  }

  async handleNameChange(event: { sectionId: string; name: string }) {
    const projectId = this.project().id;
    await this.projectService.updateSection(projectId, event.sectionId, { name: event.name });
  }

  async handleReorder(event: { sectionId: string; direction: 'left' | 'right' }) {
    const sections = [...this.projectSections()];
    const currentIndex = sections.findIndex((s) => s.id === event.sectionId);

    if (currentIndex === -1) return;

    const newIndex = event.direction === 'left' ? currentIndex - 1 : currentIndex + 1;

    if (newIndex < 0 || newIndex >= sections.length) return;

    // Swap the sections
    [sections[currentIndex], sections[newIndex]] = [sections[newIndex], sections[currentIndex]];

    // Update order values
    const reorderedSections = sections.map((s, index) => ({ ...s, order: index }));

    await this.projectService.reorderSections(this.project().id, reorderedSections);
  }

  handleSettingsChange(event: { sectionId: string; settings: Partial<ColumnDisplaySettings> }) {
    this.columnDisplaySettings.update((current) => ({
      ...current,
      [event.sectionId]: {
        ...this.getColumnSettings(event.sectionId),
        ...event.settings,
      },
    }));
  }

  async handleDeleteSection(sectionId: string) {
    const otherSections = this.projectSections().filter((s) => s.id !== sectionId);
    if (otherSections.length === 0) {
      console.warn('Cannot delete the last column of a project.');
      return;
    }

    // Check if there are tasks in this section
    const tasksInSection = this.tasks().filter((t) => t.sectionId === sectionId);
    if (tasksInSection.length > 0) {
      // Move tasks to the first available section
      const targetSection = otherSections[0];
      // Move all tasks concurrently to improve performance
      await Promise.all(
        tasksInSection.map((task) =>
          this.taskService.updateTask(task.id, { sectionId: targetSection.id }),
        ),
      );
    }

    await this.projectService.removeSection(this.project().id, sectionId);
    this.closeColumnMenu();
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

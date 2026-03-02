import { Component, input, output, signal, computed, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OverlayModule, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { Section, CYBERPUNK_COLORS } from '../../core/models/domain.model';
import { ProjectService } from '../../core/services/project.service';

/**
 * Column display settings that can be customized per column
 */
export interface ColumnDisplaySettings {
  hideCompletedTasks: boolean;
  compactMode: boolean;
  showTaskCount: boolean;
  taskLimit: number | null; // null = no limit
}

/**
 * Predefined color palette for cyberpunk theme
 */
const COLUMN_COLORS = [
  { name: 'Cyber Purple', value: '#e040fb' },
  { name: 'Neon Purple', value: '#b026ff' },
  { name: 'Cyber Blue', value: '#00d2ff' },
  { name: 'Electric Blue', value: '#2979ff' },
  { name: 'Neon Pink', value: '#ff6090' },
  { name: 'Hot Pink', value: '#ff4081' },
  { name: 'Electric Green', value: '#00ff9f' },
  { name: 'Neon Green', value: '#76ff03' },
  { name: 'Teal', value: '#26a69a' },
  { name: 'Cyan', value: '#00e5ff' },
  { name: 'Amber', value: '#ffc107' },
  { name: 'Gold', value: '#ffd700' },
  { name: 'Orange', value: '#ff9800' },
  { name: 'Deep Orange', value: '#ff7043' },
  { name: 'Coral', value: '#ff6b6b' },
  { name: 'Red', value: '#ff1744' },
  { name: 'Indigo', value: '#5c6bc0' },
  { name: 'Deep Purple', value: '#651fff' },
  { name: 'Muted Gray', value: '#6b7280' },
  { name: 'Slate', value: '#94a3b8' },
];

@Component({
  selector: 'app-column-settings-menu',
  standalone: true,
  imports: [CommonModule, FormsModule, OverlayModule],
  template: `
    @if (isOpen() && trigger()) {
      <!-- Menu Panel via CDK Overlay -->
      <ng-template
        cdkConnectedOverlay
        [cdkConnectedOverlayOrigin]="trigger()!"
        [cdkConnectedOverlayOpen]="isOpen()"
        [cdkConnectedOverlayHasBackdrop]="true"
        cdkConnectedOverlayBackdropClass="bg-black/50"
        [cdkConnectedOverlayPush]="true"
        [cdkConnectedOverlayFlexibleDimensions]="true"
        [cdkConnectedOverlayViewportMargin]="16"
        (backdropClick)="close.emit()"
      >
        <div
          class="column-settings-panel w-[90vw] max-w-[380px] overflow-y-auto bg-slate-900 border border-white/20 rounded-xl shadow-2xl scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent pointer-events-auto"
        >
          <!-- Header -->
          <div class="px-5 py-4 border-b border-white/10 bg-slate-800/80">
            <div class="flex items-center justify-between">
              <h3 class="text-base font-semibold" [ngStyle]="{ color: section().color || '#fff' }">
                Column Settings
              </h3>
              <button
                class="text-slate-400 hover:text-white transition-colors"
                (click)="close.emit()"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          <!-- Section Name Edit -->
          <div class="px-4 py-3 border-b border-white/5">
            <label class="block text-xs text-slate-400 mb-1.5">Column Name</label>
            <div class="flex gap-2">
              <input
                type="text"
                [(ngModel)]="editedName"
                class="flex-1 px-3 py-1.5 bg-slate-800/60 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30"
                (keyup.enter)="saveName()"
              />
              <button
                class="px-3 py-1.5 bg-purple-600/30 text-purple-300 rounded-lg text-xs font-medium hover:bg-purple-600/50 transition-colors"
                [disabled]="!isNameChanged()"
                [class.opacity-50]="!isNameChanged()"
                (click)="saveName()"
              >
                Save
              </button>
            </div>
          </div>

          <!-- Color Picker -->
          <div class="px-4 py-3 border-b border-white/5">
            <label class="block text-xs text-slate-400 mb-2">Column Color</label>
            <div class="grid grid-cols-5 gap-2">
              @for (color of colors; track color.value) {
                <button
                  class="w-8 h-8 rounded-lg transition-all duration-200 relative group"
                  [ngStyle]="{
                    'background-color': color.value,
                    'box-shadow':
                      section().color === color.value
                        ? '0 0 12px ' + color.value + ', 0 0 4px ' + color.value
                        : 'none',
                  }"
                  [class.ring-2]="section().color === color.value"
                  [class.ring-white/40]="section().color === color.value"
                  (click)="changeColor(color.value)"
                  [title]="color.name"
                >
                  @if (section().color === color.value) {
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-4 w-4 absolute inset-0 m-auto text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      stroke-width="3"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  }
                  <span
                    class="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none"
                  >
                    {{ color.name }}
                  </span>
                </button>
              }
            </div>
          </div>

          <!-- Reorder Section -->
          <div class="px-4 py-3 border-b border-white/5">
            <label class="block text-xs text-slate-400 mb-2">Reorder Column</label>
            <div class="flex gap-2">
              <button
                class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800/60 rounded-lg text-xs text-slate-300 hover:bg-slate-700/60 hover:text-white transition-all border border-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                [disabled]="!canMoveLeft()"
                (click)="moveLeft()"
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
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Move Left
              </button>
              <button
                class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800/60 rounded-lg text-xs text-slate-300 hover:bg-slate-700/60 hover:text-white transition-all border border-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                [disabled]="!canMoveRight()"
                (click)="moveRight()"
              >
                Move Right
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
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          </div>

          <!-- Display Options -->
          @if (isDoneColumn()) {
            <div class="px-4 py-3 border-b border-white/5">
              <label class="block text-xs text-slate-400 mb-2">Completed Tasks</label>
              <div class="space-y-2">
                <label class="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    [checked]="hideCompletedTasks()"
                    (change)="toggleHideCompleted()"
                    class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
                  />
                  <span class="text-sm text-slate-300 group-hover:text-white transition-colors">
                    Hide completed tasks in this column
                  </span>
                </label>
                <p class="text-xs text-slate-500 pl-7">
                  When enabled, all completed tasks in this column will be hidden
                </p>
              </div>
            </div>
          }

          <!-- Additional Display Options -->
          <div class="px-4 py-3 border-b border-white/5">
            <label class="block text-xs text-slate-400 mb-2">Display Options</label>
            <div class="space-y-2.5">
              <label class="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  [checked]="compactMode()"
                  (change)="toggleCompactMode()"
                  class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
                />
                <span class="text-sm text-slate-300 group-hover:text-white transition-colors">
                  Compact card view
                </span>
              </label>
              <label class="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  [checked]="showTaskCount()"
                  (change)="toggleShowTaskCount()"
                  class="w-4 h-4 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
                />
                <span class="text-sm text-slate-300 group-hover:text-white transition-colors">
                  Show task count badge
                </span>
              </label>
            </div>
          </div>

          <!-- Task Limit -->
          <div class="px-4 py-3 border-b border-white/5">
            <label class="block text-xs text-slate-400 mb-2">Work-in-Progress Limit</label>
            <div class="flex items-center gap-3">
              <select
                [(ngModel)]="selectedTaskLimit"
                (ngModelChange)="updateTaskLimit($event)"
                class="flex-1 px-3 py-1.5 bg-slate-800/60 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500/50"
              >
                <option [ngValue]="null">No limit</option>
                <option [ngValue]="3">3 tasks</option>
                <option [ngValue]="5">5 tasks</option>
                <option [ngValue]="7">7 tasks</option>
                <option [ngValue]="10">10 tasks</option>
                <option [ngValue]="15">15 tasks</option>
              </select>
            </div>
            <p class="text-xs text-slate-500 mt-1.5">
              Visual warning when column exceeds this limit
            </p>
          </div>

          <!-- Danger Zone -->
          <div class="px-4 py-3">
            <button
              class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/20 transition-all border border-rose-500/20"
              (click)="deleteSection()"
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
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Delete Column
            </button>
          </div>
        </div>
      </ng-template>
    }
  `,
  styleUrls: ['./column-settings-menu.component.scss'],
})
export class ColumnSettingsMenuComponent {
  private readonly projectService = inject(ProjectService);

  // Inputs
  section = input.required<Section>();
  projectId = input.required<string>();
  isOpen = input.required<boolean>();
  sectionIndex = input.required<number>();
  totalSections = input.required<number>();
  trigger = input<CdkOverlayOrigin | null>(null); // Trigger element for positioning the generic overlay
  columnSettings = input<ColumnDisplaySettings>({
    hideCompletedTasks: false,
    compactMode: false,
    showTaskCount: true,
    taskLimit: null,
  });

  // Outputs
  close = output<void>();
  colorChanged = output<{ sectionId: string; color: string }>();
  nameChanged = output<{ sectionId: string; name: string }>();
  reorder = output<{ sectionId: string; direction: 'left' | 'right' }>();
  settingsChanged = output<{ sectionId: string; settings: Partial<ColumnDisplaySettings> }>();
  delete = output<string>(); // sectionId

  // Local state
  editedName = signal('');
  colors = COLUMN_COLORS;

  // Display settings signals
  hideCompletedTasks = signal(false);
  compactMode = signal(false);
  showTaskCount = signal(true);
  selectedTaskLimit: number | null = null;

  // Menu position
  menuMaxHeight = 800;

  constructor() {
    // Use effect() to react to input signal changes
    effect(() => {
      // Sync local state with section input
      this.editedName.set(this.section().name);

      // Sync display settings
      const settings = this.columnSettings();
      this.hideCompletedTasks.set(settings.hideCompletedTasks);
      this.compactMode.set(settings.compactMode);
      this.showTaskCount.set(settings.showTaskCount);
      this.selectedTaskLimit = settings.taskLimit;
    });
  }

  isNameChanged(): boolean {
    return this.editedName().trim() !== this.section().name && this.editedName().trim().length > 0;
  }

  saveName(): void {
    const newName = this.editedName().trim();
    if (newName && newName !== this.section().name) {
      this.nameChanged.emit({ sectionId: this.section().id, name: newName });
    }
  }

  changeColor(color: string): void {
    this.colorChanged.emit({ sectionId: this.section().id, color });
  }

  canMoveLeft(): boolean {
    return this.sectionIndex() > 0;
  }

  canMoveRight(): boolean {
    return this.sectionIndex() < this.totalSections() - 1;
  }

  moveLeft(): void {
    if (this.canMoveLeft()) {
      this.reorder.emit({ sectionId: this.section().id, direction: 'left' });
    }
  }

  moveRight(): void {
    if (this.canMoveRight()) {
      this.reorder.emit({ sectionId: this.section().id, direction: 'right' });
    }
  }

  isDoneColumn(): boolean {
    const status = this.section().status;
    if (status === 'done') return true;

    // Also check name for backwards compatibility
    const nameLower = this.section().name.toLowerCase();
    return (
      nameLower.includes('done') || nameLower.includes('complete') || nameLower.includes('finished')
    );
  }

  toggleHideCompleted(): void {
    const newValue = !this.hideCompletedTasks();
    this.hideCompletedTasks.set(newValue);
    this.settingsChanged.emit({
      sectionId: this.section().id,
      settings: { hideCompletedTasks: newValue },
    });
  }

  toggleCompactMode(): void {
    const newValue = !this.compactMode();
    this.compactMode.set(newValue);
    this.settingsChanged.emit({
      sectionId: this.section().id,
      settings: { compactMode: newValue },
    });
  }

  toggleShowTaskCount(): void {
    const newValue = !this.showTaskCount();
    this.showTaskCount.set(newValue);
    this.settingsChanged.emit({
      sectionId: this.section().id,
      settings: { showTaskCount: newValue },
    });
  }

  updateTaskLimit(limit: number | null): void {
    this.settingsChanged.emit({
      sectionId: this.section().id,
      settings: { taskLimit: limit },
    });
  }

  deleteSection(): void {
    this.delete.emit(this.section().id);
    this.close.emit();
  }
}

import { Component, input, output, signal, computed, inject, effect , ChangeDetectionStrategy } from '@angular/core';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-column-settings-menu',
  standalone: true,
  imports: [CommonModule, FormsModule, OverlayModule],
  templateUrl: './column-settings-menu.component.html',
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

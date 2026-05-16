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
import { hexToRgba, getColorWithOpacity } from '../../core/utils/color.utils';
import { MarkdownPipe, MarkdownPlainPipe } from '../../shared/pipes/markdown.pipe';
import {
  ColumnSettingsMenuComponent,
  ColumnDisplaySettings,
} from './column-settings-menu.component';
import { OverlayModule } from '@angular/cdk/overlay';
import { PointValueBadgeComponent } from './components/point-value-badge';

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
    PointValueBadgeComponent,
  ],
  templateUrl: './task-board-view.component.html',
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
    return hexToRgba(hex, alpha);
  }

  /**
   * Get color with opacity for dynamic styles
   */
  getColorWithOpacity(color: string | undefined, opacity: number): string {
    return getColorWithOpacity(color, opacity, '#64748b');
  }
}

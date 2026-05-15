import {
  Component,
  input,
  output,
  computed,
  signal,
  inject,
  effect,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormsModule } from '@angular/forms';
import { TaskService } from '../../core/services/task.service';
import { ProjectService } from '../../core/services/project.service';
import { DialogService } from '../../core/services/dialog.service';
import { ContactsService } from '../../core/services/contacts.service';
import { Contact } from '../../core/models/contact.model';

import { CustomFieldService } from '../../core/services/custom-field.service';
import { TaskDependencyService } from '../../core/services/task-dependency.service';
import { Task, Project, CustomFieldDefinition, PointValue } from '../../core/models/domain.model';
import { UserGroupMember } from '../../core/models/user-group.model';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of, map, BehaviorSubject, debounceTime, firstValueFrom } from 'rxjs';
import {
  AutocompleteInputComponent,
  AutocompleteOption,
} from '../../shared/components/autocomplete-input/autocomplete-input.component';
import { MarkdownEditorComponent } from '../../shared/components/markdown-editor/markdown-editor.component';
import {
  CustomSelectComponent,
  SelectOption,
} from '../../shared/components/custom-select/custom-select.component';
import { CustomDatePickerComponent } from '../../shared/components/custom-date-picker/custom-date-picker.component';

import { TaskDetailHeaderComponent } from './components/task-detail-header';
import { TaskFieldsSidebarComponent } from './components/task-fields-sidebar';
import { TaskSubtasksComponent } from './components/task-subtasks';
import { TaskTagsComponent } from './components/task-tags';
import { TaskAiActionsComponent } from './components/task-ai-actions';
import { TaskPointValueInputComponent } from './components/task-point-value-input';

@Component({
  selector: 'app-task-detail-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    AutocompleteInputComponent,
    MarkdownEditorComponent,
    TaskDetailHeaderComponent,
    TaskFieldsSidebarComponent,
    TaskSubtasksComponent,
    TaskTagsComponent,
    TaskAiActionsComponent,
    TaskPointValueInputComponent,
  ],
  templateUrl: './task-detail-modal.component.html',
  styleUrls: ['./task-detail-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskDetailModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly taskService = inject(TaskService);
  private readonly projectService = inject(ProjectService);
  private readonly customFieldService = inject(CustomFieldService);
  private readonly dialogService = inject(DialogService);
  private readonly contactsService = inject(ContactsService);
  private readonly taskDependencyService = inject(TaskDependencyService);

  // Input
  task = input<Task | null>(null);

  // project ID needed to fetch sections
  projectId = input<string | null>(null);

  // Output
  close = output<void>();
  updated = output<Task>();
  deleted = output<string>();

  // Derived project signal
  project = toSignal(
    toObservable(this.projectId).pipe(
      switchMap((id) => (id ? this.projectService.getProject$(id) : of(null))),
    ),
    { initialValue: null },
  );

  projectSections = computed(() => {
    return this.project()?.sections || [];
  });

  globalFields = toSignal(this.customFieldService.getCustomFields(), { initialValue: [] });

  projectCustomFields = computed(() => {
    const ids = this.project()?.customFieldIds || [];
    return this.globalFields().filter((f) => ids.includes(f.id));
  });

  // Contacts for assignee autocomplete
  private assigneeSearchSubject = new BehaviorSubject<string>('');

  assigneeOptions = toSignal(
    this.assigneeSearchSubject.pipe(
      debounceTime(300),
      switchMap((query) => this.contactsService.searchContacts(query)),
      map((contacts) =>
        contacts.map(
          (c): AutocompleteOption => ({
            id: c.id,
            label: c.displayName,
            sublabel: c.email,
            avatar: c.photoURL,
            // Generate consistent color from email for contacts without photos
            color: c.photoURL ? undefined : this.generateAvatarColor(c.email),
          }),
        ),
      ),
    ),
    { initialValue: [] },
  );

  onAssigneeSearch(query: string): void {
    this.assigneeSearchSubject.next(query);
  }

  /**
   * Generate a consistent color for a contact based on their email
   */
  generateAvatarColor = (email: string): string => {
    const colors = [
      '#8b5cf6',
      '#3b82f6',
      '#06b6d4',
      '#10b981',
      '#f59e0b',
      '#ef4444',
      '#ec4899',
      '#6366f1',
      '#14b8a6',
      '#f97316',
    ];
    const hash = email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // Multi-assignee tracking
  selectedAssignees = signal<AutocompleteOption[]>([]);
  notifyAssigneesSig = signal(true); // Default: notify on assignment/status

  /**
   * Compute available assignee options (exclude already selected)
   */
  availableAssigneeOptions = computed(() => {
    const selected = new Set(this.selectedAssignees().map((a) => a.id));
    return this.assigneeOptions().filter((opt) => !selected.has(opt.id));
  });

  form = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    status: ['todo'],
    startDate: [''],
    dueDate: [''],
    priority: ['medium'],
    sectionId: [null as string | null],
  });

  // Subtasks & Dependencies state
  subtasks = signal<Task[]>([]);
  blockingTasks = signal<Task[]>([]);
  blockedByTasks = signal<Task[]>([]);
  allProjectTasks = signal<Task[]>([]); // For dependency autocomplete

  customFieldValues = signal<Record<string, any>>({});

  // Point value
  pointValue = signal<PointValue | undefined>(undefined);

  // Tags
  selectedTags = signal<Set<string>>(new Set());

  priorityOptions: SelectOption[] = [
    { value: 'low', label: 'Low', colorClass: 'bg-emerald-400 text-emerald-400' },
    { value: 'medium', label: 'Medium', colorClass: 'bg-amber-400 text-amber-400' },
    { value: 'high', label: 'High', colorClass: 'bg-rose-500 text-rose-500' },
  ];

  statusOptions: SelectOption[] = [
    { value: 'todo', label: 'To Do', icon: '📋' },
    { value: 'in-progress', label: 'In Progress', icon: '⏳' },
    { value: 'done', label: 'Done', icon: '✅' },
  ];

  sectionOptions = computed<SelectOption[]>(() => {
    const defaultOption = { value: '', label: 'No Section', icon: '📁' };
    const mappedSections = this.projectSections().map((s) => ({
      value: s.id,
      label: s.name,
      icon: '📁',
    }));
    return [defaultOption, ...mappedSections];
  });

  // Options for dependency autocomplete
  dependencyOptions = computed(() => {
    const currentId = this.task()?.id;
    return this.allProjectTasks()
      .filter((t) => t.id !== currentId && !t.parentId)
      .map((t) => ({ id: t.id, label: t.title }));
  });

  constructor() {
    // Sync form with task input
    effect(() => {
      const task = this.task();
      if (task) {
        this.form.patchValue(
          {
            title: task.title,
            description: task.description,
            status: task.status,
            startDate: (task as any).startDate ? this.toInputDate((task as any).startDate) : '',
            dueDate: task.dueDate ? this.toInputDate(task.dueDate) : '',
            priority: task.priority,
            sectionId: task.sectionId || null,
          },
          { emitEvent: false },
        );

        // Populate multi-assignee list from task data
        const ids = task.assigneeIds || (task.assignedToId ? [task.assignedToId] : []);
        const names = task.assigneeNames || (task.assigneeName ? [task.assigneeName] : []);
        let options: AutocompleteOption[];
        if (ids.length > 0) {
          options = ids.map((id: string, idx: number) => ({
            id,
            label: names[idx] || id,
            color: this.generateAvatarColor(id),
          }));
        } else if (names.length > 0) {
          // Legacy: assigneeName set without assignedToId — preserve name-only assignment
          options = names.map((name: string) => ({
            id: name,
            label: name,
            color: this.generateAvatarColor(name),
          }));
        } else {
          options = [];
        }
        this.selectedAssignees.set(options);
        this.notifyAssigneesSig.set(task.notifyAssignees ?? true);

        // Load custom fields
        this.customFieldValues.set(task.customFieldValues || {});

        // Load point value
        this.pointValue.set(task.pointValue);

        // Initialize selected tags
        this.selectedTags.set(new Set(task.tags || []));

        // Fetch dependencies
        this.loadRelatedTasks(task.id, task.projectId);
      }
    });
  }

  public async loadRelatedTasks(taskId: string, projectId: string) {
    try {
      // Load all project tasks for dependency autocomplete dropdown
      const allTasks = await firstValueFrom(this.taskService.getTasksByProject(projectId));
      this.allProjectTasks.set(allTasks);

      // Filter subtasks from the already-fetched data (targeted by parentId)
      const subtasks = allTasks.filter((t) => t.parentId === taskId);
      this.subtasks.set(subtasks);

      // Fetch blocking/blockedBy tasks by their specific IDs (typically small arrays)
      const currentTask = await this.taskService.getTask(taskId);
      if (currentTask) {
        const blockingList = await Promise.all(
          (currentTask.blockingIds || []).map((id) => this.taskService.getTask(id)),
        );
        const blockedByList = await Promise.all(
          (currentTask.blockedByIds || []).map((id) => this.taskService.getTask(id)),
        );
        this.blockingTasks.set(blockingList.filter((t): t is Task => t !== null));
        this.blockedByTasks.set(blockedByList.filter((t): t is Task => t !== null));
      }
    } catch (err) {
      console.error('Failed to load related tasks', err);
    }
  }

  autoResize(element: any) {
    element.style.height = 'auto';
    element.style.height = element.scrollHeight + 'px';
  }

  async updateCustomField(
    fieldId: string,
    value: string | number | boolean | Date | null | string[],
  ) {
    // Find the field definition to validate
    const field = this.projectCustomFields().find((f) => f.id === fieldId);

    if (field) {
      // Validate number/currency fields
      if ((field.type === 'number' || field.type === 'currency') && value) {
        const numValue = parseFloat(value as string);
        if (isNaN(numValue)) {
          await this.dialogService.alert(
            `"${field.name}" must be a valid number.`,
            'Invalid Input',
          );
          return;
        }
      }

      // Validate date fields
      if (field.type === 'date' && value) {
        const dateValue = new Date(value as string | Date);
        if (isNaN(dateValue.getTime())) {
          await this.dialogService.alert(`"${field.name}" must be a valid date.`, 'Invalid Input');
          return;
        }
      }
    }

    const current = this.customFieldValues();
    this.customFieldValues.set({ ...current, [fieldId]: value });
    this.autoSave();
  }

  getMultiSelectValues(event: Event): string[] {
    const target = event.target as HTMLSelectElement;
    return Array.from(target.selectedOptions).map((o) => o.value);
  }

  /**
   * Handle assignee selection from autocomplete
   */
  onAssigneeSelected(selection: AutocompleteOption | string): void {
    if (typeof selection === 'object') {
      const current = this.selectedAssignees();
      if (!current.find((a) => a.id === selection.id)) {
        this.selectedAssignees.set([...current, selection]);
        this.form.markAsDirty();
        this.autoSave();
      }
    }
  }

  /**
   * Remove an assignee from the selected list
   */
  removeAssignee(id: string): void {
    this.selectedAssignees.update((list) => list.filter((a) => a.id !== id));
    this.form.markAsDirty();
    this.autoSave();
  }

  /**
   * Apply every member of a user group to the assignee list, then auto-save.
   * Skips anyone already assigned so re-applying a group is idempotent.
   */
  applyGroupToAssignees(members: UserGroupMember[]): void {
    if (!members?.length) return;
    const current = this.selectedAssignees();
    const seen = new Set(current.map((a) => a.id));
    const additions: AutocompleteOption[] = [];
    for (const m of members) {
      if (!m?.id || seen.has(m.id)) continue;
      seen.add(m.id);
      additions.push({
        id: m.id,
        label: m.displayName || m.email || m.id,
        sublabel: m.email,
        avatar: m.photoURL,
        color: m.photoURL ? undefined : this.generateAvatarColor(m.email || m.id),
      });
    }
    if (additions.length) {
      this.selectedAssignees.set([...current, ...additions]);
      this.form.markAsDirty();
      this.autoSave();
    }
  }

  /**
   * Handle notify assignees checkbox change
   */
  onNotifyAssigneesChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.notifyAssigneesSig.set(input.checked);
    this.form.markAsDirty();
    this.autoSave();
  }

  onPointValueChange(value: PointValue | undefined): void {
    this.pointValue.set(value);
    this.form.markAsDirty();
    this.autoSave();
  }

  async autoSave() {
    const task = this.task();
    const project = this.project();
    if (!task || this.form.invalid || !this.form.dirty) return;

    const val = this.form.value;
    const startDate = val.startDate ? new Date(val.startDate) : undefined;
    const dueDate = val.dueDate ? new Date(val.dueDate) : undefined;

    const assignees = this.selectedAssignees();
    const assigneeIds = assignees.map((a) => a.id);
    const assigneeNames = assignees.map((a) => a.label);

    const updates: Partial<Task> = {
      title: val.title!,
      description: val.description || '',
      // Multi-assignee fields
      assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
      assigneeNames: assigneeNames.length > 0 ? assigneeNames : undefined,
      notifyAssignees: this.notifyAssigneesSig(),
      // Backward compat
      assignedToId: assigneeIds[0] || undefined,
      assigneeName: assigneeNames[0] || undefined,
      status: val.status as Task['status'],
      dueDate,
      priority: val.priority as Task['priority'],
      sectionId: val.sectionId || undefined,
      customFieldValues: this.customFieldValues(),
      pointValue: this.pointValue(),
    };

    // Add startDate to updates (extending Task type for this)
    (updates as any).startDate = startDate;

    try {
      await this.taskService.updateTask(task.id, updates, project?.googleTaskListId);
      this.updated.emit({ ...task, ...updates } as Task);
    } catch (e) {
      console.error('Auto-save failed', e);
    }
  }

  async toggleComplete() {
    const task = this.task();
    const project = this.project();
    if (!task) return;

    if (task.status === 'done') {
      await this.taskService.reopenTask(task.id, project?.googleTaskListId);
      this.updated.emit({ ...task, status: 'todo', completedAt: null });
    } else {
      // Check for blockers
      const incompleteBlockers = this.blockedByTasks().filter((t) => t.status !== 'done');
      if (incompleteBlockers.length > 0) {
        await this.dialogService.alert(
          'This task is blocked by other tasks that are not yet completed.',
          'Cannot Complete Task',
        );
        return; // Prevent completion
      }

      await this.taskService.completeTask(task.id, project?.googleTaskListId);
      this.updated.emit({
        ...task,
        status: 'done',
        completedAt: new Date() as unknown as Task['completedAt'],
      });
    }
  }

  async deleteTask() {
    const task = this.task();
    const project = this.project();
    if (!task || !(await this.dialogService.confirm('Are you sure you want to delete this task?')))
      return;

    await this.taskService.deleteTask(task.id, project?.googleTaskListId);
    this.deleted.emit(task.id);
    this.close.emit();
  }

  // Dependency methods
  async onAddDependency(type: 'blocks' | 'isBlockedBy', evt: AutocompleteOption | string) {
    if (typeof evt !== 'object') return;
    const task = this.task();
    if (!task) return;

    try {
      if (type === 'blocks') {
        // This task blocks the selected task
        await this.taskDependencyService.addDependency(task.id, evt.id);
      } else {
        // The selected task blocks this task
        await this.taskDependencyService.addDependency(evt.id, task.id);
      }
      this.loadRelatedTasks(task.id, task.projectId);
    } catch (err: any) {
      await this.dialogService.alert(err.message || 'Could not add dependency.', 'Error');
    }
  }

  async removeDependency(type: 'blocks' | 'isBlockedBy', otherTaskId: string) {
    const task = this.task();
    if (!task) return;

    try {
      if (type === 'blocks') {
        await this.taskDependencyService.removeDependency(task.id, otherTaskId);
      } else {
        await this.taskDependencyService.removeDependency(otherTaskId, task.id);
      }
      this.loadRelatedTasks(task.id, task.projectId);
    } catch (err) {
      console.error(err);
    }
  }

  onExampleClick(e: Event) {
    if (e.target === e.currentTarget) {
      this.close.emit();
    }
  }

  private toInputDate(date: any): string {
    if (!date) return '';
    try {
      const d = date.toDate ? date.toDate() : new Date(date);
      return d.toISOString().split('T')[0];
    } catch {
      return '';
    }
  }
}

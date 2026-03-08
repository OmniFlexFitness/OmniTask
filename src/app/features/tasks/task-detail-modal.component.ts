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
import { ContactsService, Contact } from '../../core/services/contacts.service';
import { VertexAiService } from '../../core/services/vertex-ai.service';
import { CustomFieldService } from '../../core/services/custom-field.service';
import { TaskDependencyService } from '../../core/services/task-dependency.service';
import { Task, Project, CustomFieldDefinition } from '../../core/models/domain.model';
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

@Component({
  selector: 'app-task-detail-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    AutocompleteInputComponent,
    MarkdownEditorComponent,
    CustomSelectComponent,
    CustomDatePickerComponent,
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
  private readonly vertexAiService = inject(VertexAiService);
  private readonly taskDependencyService = inject(TaskDependencyService);

  // AI Loading states
  generatingSubtasks = this.vertexAiService.generatingSubtasks;
  enhancingDescription = this.vertexAiService.enhancingDescription;

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
  generateAvatarColor(email: string): string {
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
  }

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
  selectedTags = signal<Set<string>>(new Set());
  selectedTagsArray = computed(() => Array.from(this.selectedTags()));
  newSubtaskTitle = '';
  expandedSubtaskIds = signal<Set<string>>(new Set());

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

  completedSubtasksCount = computed(
    () => this.subtasks().filter((s) => s.status === 'done').length,
  );

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

        // Initialize selected tags
        this.selectedTags.set(new Set(task.tags || []));

        // Fetch subtasks and dependencies
        this.loadRelatedTasks(task.id, task.projectId);
      }
    });
  }

  private async loadRelatedTasks(taskId: string, projectId: string) {
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

  toggleTag(tagName: string) {
    this.selectedTags.update((tags) => {
      const newTags = new Set(tags);
      if (newTags.has(tagName)) {
        newTags.delete(tagName);
      } else {
        newTags.add(tagName);
      }
      return newTags;
    });
    this.autoSave();
  }

  async addTag(tagName: string) {
    const name = tagName.trim();
    if (!name) return;

    // Add to project definitions first if it doesn't exist
    const project = this.project();
    if (project) {
      // Simple hash for color generation
      const colors = ['#f472b6', '#34d399', '#60a5fa', '#a78bfa', '#fbbf24', '#f87171'];
      const colorIndex =
        name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;

      await this.projectService.addTag(project.id, {
        name: name,
        color: colors[colorIndex],
      });
    }

    // Select it
    this.selectedTags.update((tags) => {
      const newTags = new Set(tags);
      newTags.add(name);
      return newTags;
    });
    this.autoSave();
  }

  getSelectedTagsList(): string {
    return Array.from(this.selectedTags()).join(', ');
  }

  getTagColor(tagName: string): string {
    const projectTags = this.project()?.tags || [];
    const tag = projectTags.find((t) => t.name === tagName);
    return tag?.color || '#94a3b8';
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
   * Handle notify assignees checkbox change
   */
  onNotifyAssigneesChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.notifyAssigneesSig.set(input.checked);
    this.form.markAsDirty();
    this.autoSave();
  }

  /**
   * Select an assignee for a subtask
   */
  async onSubtaskAssigneeSelected(
    subtaskId: string,
    selection: AutocompleteOption | string,
  ): Promise<void> {
    if (typeof selection !== 'object') return;

    const subtask = this.subtasks().find((s) => s.id === subtaskId);
    if (!subtask) return;

    const ids = [...(subtask.assigneeIds || [])];
    const names = [...(subtask.assigneeNames || [])];
    if (!ids.includes(selection.id)) {
      ids.push(selection.id);
      names.push(selection.label);
    }

    await this.taskService.updateTask(subtaskId, { assigneeIds: ids, assigneeNames: names });
    this.form.markAsDirty();
    await this.autoSave();

    // Reload
    if (this.task()?.id && this.task()?.projectId) {
      this.loadRelatedTasks(this.task()!.id, this.task()!.projectId);
    }
  }

  /**
   * Remove an assignee from a subtask
   */
  async removeSubtaskAssignee(subtaskId: string, index: number): Promise<void> {
    const subtask = this.subtasks().find((s) => s.id === subtaskId);
    if (!subtask) return;

    const ids = [...(subtask.assigneeIds || [])];
    const names = [...(subtask.assigneeNames || [])];
    ids.splice(index, 1);
    names.splice(index, 1);

    await this.taskService.updateTask(subtaskId, { assigneeIds: ids, assigneeNames: names });
    this.form.markAsDirty();
    await this.autoSave();

    if (this.task()?.id && this.task()?.projectId) {
      this.loadRelatedTasks(this.task()!.id, this.task()!.projectId);
    }
  }

  async autoSave() {
    const task = this.task();
    const project = this.project();
    if (!task || this.form.invalid || !this.form.dirty) return;

    const val = this.form.value;
    const startDate = val.startDate ? new Date(val.startDate) : undefined;
    const dueDate = val.dueDate ? new Date(val.dueDate) : undefined;
    const tags = Array.from(this.selectedTags());

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
      tags,
      customFieldValues: this.customFieldValues(),
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

  // Subtask methods
  async addSubtask() {
    const task = this.task();
    const project = this.project();
    if (!task || !this.newSubtaskTitle.trim()) return;

    const title = this.newSubtaskTitle.trim();
    this.newSubtaskTitle = '';

    const docRef = await this.taskService.createTask(
      {
        projectId: task.projectId,
        title: title,
        status: 'todo',
        priority: 'medium',
        order: this.subtasks().length,
        parentId: task.id,
        description: '',
      },
      project?.googleTaskListId,
    );

    // Optimistic local update — add the new subtask to the signal immediately
    this.subtasks.update((list) => [
      ...list,
      {
        id: docRef.id,
        projectId: task.projectId,
        title,
        status: 'todo',
        priority: 'medium',
        order: list.length,
        parentId: task.id,
        description: '',
        tags: [],
        subtasks: [],
        createdById: '',
        assigneeIds: [],
      } as unknown as Task,
    ]);
  }

  async toggleSubtask(subtaskId: string) {
    const task = this.task();
    const project = this.project();
    if (!task) return;

    const subtask = this.subtasks().find((s) => s.id === subtaskId);
    if (!subtask) return;

    const newStatus = subtask.status === 'done' ? 'todo' : 'done';
    if (subtask.status === 'done') {
      await this.taskService.reopenTask(subtaskId, project?.googleTaskListId);
    } else {
      await this.taskService.completeTask(subtaskId, project?.googleTaskListId);
    }

    // Optimistic local update
    this.subtasks.update((list) =>
      list.map((s) => (s.id === subtaskId ? { ...s, status: newStatus as Task['status'] } : s)),
    );
  }

  async deleteSubtask(subtaskId: string) {
    const task = this.task();
    const project = this.project();
    if (!task) return;

    await this.taskService.deleteTask(subtaskId, project?.googleTaskListId);

    // Optimistic local update — remove from signal immediately
    this.subtasks.update((list) => list.filter((s) => s.id !== subtaskId));
  }

  toggleSubtaskExpanded(subtaskId: string) {
    const current = new Set(this.expandedSubtaskIds());
    if (current.has(subtaskId)) {
      current.delete(subtaskId);
    } else {
      current.add(subtaskId);
    }
    this.expandedSubtaskIds.set(current);
  }

  async updateSubtaskDescription(subtaskId: string, description: string): Promise<void> {
    await this.taskService.updateTask(subtaskId, { description });
    if (this.task()?.id && this.task()?.projectId) {
      this.loadRelatedTasks(this.task()!.id, this.task()!.projectId);
    }
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

  /** Maximum number of AI-generated subtasks to prevent resource exhaustion */
  private static readonly MAX_AI_SUBTASKS = 10;

  // AI Methods
  async aiGenerateSubtasks() {
    const task = this.task();
    if (!task?.title?.trim()) return;

    try {
      let newSubtasks = await this.vertexAiService.generateSubtasks(
        task.title,
        this.form.value.description || undefined,
        this.project()?.name,
      );

      // Cap the number of AI-generated subtasks to prevent resource exhaustion
      if (newSubtasks.length > TaskDetailModalComponent.MAX_AI_SUBTASKS) {
        console.warn(
          `AI returned ${newSubtasks.length} subtasks, capping at ${TaskDetailModalComponent.MAX_AI_SUBTASKS}`,
        );
        newSubtasks = newSubtasks.slice(0, TaskDetailModalComponent.MAX_AI_SUBTASKS);
      }

      // In the new system, we map the text to actual independent task documents
      const googleId = this.project()?.googleTaskListId;
      for (const st of newSubtasks) {
        await this.taskService.createTask(
          {
            title: st.title,
            description: st.description || '',
            projectId: task.projectId,
            parentId: task.id,
            status: 'todo',
            priority: 'medium',
            order: this.subtasks().length,
          },
          googleId,
        );
      }

      // Reload subtasks from server after AI generation
      this.loadRelatedTasks(task.id, task.projectId);
    } catch (err) {
      console.error('Failed to generate subtasks:', err);
    }
  }

  async aiEnhanceDescription() {
    const task = this.task();
    const description = this.form.value.description;
    if (!task?.title?.trim() || !description?.trim()) return;

    try {
      const result = await this.vertexAiService.enhanceDescription(
        task.title,
        description,
        this.project()?.name,
      );

      this.form.patchValue({ description: result.enhancedDescription });
      this.form.markAsDirty();
      await this.autoSave();
    } catch (err) {
      console.error('Failed to enhance description:', err);
    }
  }
}

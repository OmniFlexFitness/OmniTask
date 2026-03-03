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
import { Task, Project, Subtask } from '../../core/models/domain.model';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of, map, BehaviorSubject, debounceTime } from 'rxjs';
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
  private readonly dialogService = inject(DialogService);
  private readonly contactsService = inject(ContactsService);
  private readonly vertexAiService = inject(VertexAiService);

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

  // Subtasks state
  subtasks = signal<Subtask[]>([]);
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
    return this.projectSections().map((s) => ({
      value: s.id,
      label: s.name,
      icon: '📁',
    }));
  });

  completedSubtasksCount = computed(() => this.subtasks().filter((s) => s.completed).length);

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

        // Load subtasks and custom fields
        this.subtasks.set(task.subtasks || []);
        this.customFieldValues.set(task.customFieldValues || {});

        // Initialize selected tags
        this.selectedTags.set(new Set(task.tags || []));
      }
    });
  }

  autoResize(element: any) {
    element.style.height = 'auto';
    element.style.height = element.scrollHeight + 'px';
  }

  async updateCustomField(fieldId: string, value: string | number | boolean | Date | null) {
    // Find the field definition to validate
    const project = this.project();
    const field = project?.customFields?.find((f) => f.id === fieldId);

    if (field) {
      // Validate number fields
      if (field.type === 'number' && value) {
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
  onSubtaskAssigneeSelected(subtaskId: string, selection: AutocompleteOption | string): void {
    if (typeof selection !== 'object') return;
    const updated = this.subtasks().map((s) => {
      if (s.id !== subtaskId) return s;
      const ids = [...(s.assigneeIds || [])];
      const names = [...(s.assigneeNames || [])];
      if (!ids.includes(selection.id)) {
        ids.push(selection.id);
        names.push(selection.label);
      }
      return { ...s, assigneeIds: ids, assigneeNames: names };
    });
    this.subtasks.set(updated);
    this.form.markAsDirty();
    this.autoSave();
  }

  /**
   * Remove an assignee from a subtask
   */
  removeSubtaskAssignee(subtaskId: string, index: number): void {
    const updated = this.subtasks().map((s) => {
      if (s.id !== subtaskId) return s;
      const ids = [...(s.assigneeIds || [])];
      const names = [...(s.assigneeNames || [])];
      ids.splice(index, 1);
      names.splice(index, 1);
      return { ...s, assigneeIds: ids, assigneeNames: names };
    });
    this.subtasks.set(updated);
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
      subtasks: this.subtasks(),
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

    const newSubtask: Subtask = {
      id: crypto.randomUUID(),
      title: this.newSubtaskTitle.trim(),
      completed: false,
    };

    const updatedSubtasks = [...this.subtasks(), newSubtask];
    this.subtasks.set(updatedSubtasks);
    this.newSubtaskTitle = '';

    await this.taskService.updateTask(
      task.id,
      { subtasks: updatedSubtasks },
      project?.googleTaskListId,
    );
  }

  async toggleSubtask(subtaskId: string) {
    const task = this.task();
    const project = this.project();
    if (!task) return;

    const updatedSubtasks = this.subtasks().map((s) =>
      s.id === subtaskId ? { ...s, completed: !s.completed } : s,
    );
    this.subtasks.set(updatedSubtasks);

    await this.taskService.updateTask(
      task.id,
      { subtasks: updatedSubtasks },
      project?.googleTaskListId,
    );
  }

  async deleteSubtask(subtaskId: string) {
    const task = this.task();
    const project = this.project();
    if (!task) return;

    const updatedSubtasks = this.subtasks().filter((s) => s.id !== subtaskId);
    this.subtasks.set(updatedSubtasks);

    await this.taskService.updateTask(
      task.id,
      { subtasks: updatedSubtasks },
      project?.googleTaskListId,
    );
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
    const updated = this.subtasks().map((s) => (s.id === subtaskId ? { ...s, description } : s));
    this.subtasks.set(updated);
    this.form.markAsDirty();
    await this.autoSave();
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

  // AI Methods
  async aiGenerateSubtasks() {
    const task = this.task();
    if (!task?.title?.trim()) return;

    try {
      const newSubtasks = await this.vertexAiService.generateSubtasks(
        task.title,
        this.form.value.description || undefined,
        this.project()?.name,
      );

      // Merge with existing subtasks
      const currentSubtasks = this.subtasks();
      const mergedSubtasks = [...currentSubtasks, ...newSubtasks];
      this.subtasks.set(mergedSubtasks);

      // Auto-save the new subtasks
      const project = this.project();
      await this.taskService.updateTask(
        task.id,
        { subtasks: mergedSubtasks },
        project?.googleTaskListId,
      );
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

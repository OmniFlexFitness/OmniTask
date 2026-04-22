import {
  Component,
  input,
  output,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TaskService } from '../../core/services/task.service';
import { ProjectService } from '../../core/services/project.service';
import { CustomFieldService } from '../../core/services/custom-field.service';
import { ContactsService } from '../../core/services/contacts.service';
import { Contact } from '../../core/models/contact.model';

import {
  Task,
  Project,
  Section,
  Subtask,
  CustomFieldDefinition,
} from '../../core/models/domain.model';
import { toSignal, toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, of, map, startWith, debounceTime } from 'rxjs';
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
import { BehaviorSubject } from 'rxjs';
import { UserGroupMember } from '../../core/models/user-group.model';

import { TaskFormFieldsComponent } from './components/task-form-fields';
import { TaskAiSuggestionsComponent } from './components/task-ai-suggestions';
import { TaskCustomFieldsFormComponent } from './components/task-custom-fields-form';
import { TaskTagsComponent } from './components/task-tags';

@Component({
  selector: 'app-task-create-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TaskFormFieldsComponent,
    TaskAiSuggestionsComponent,
    TaskCustomFieldsFormComponent,
    TaskTagsComponent,
  ],
  templateUrl: './task-create-modal.component.html',
  styleUrls: ['./task-create-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskCreateModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly taskService = inject(TaskService);
  private readonly projectService = inject(ProjectService);
  private readonly customFieldService = inject(CustomFieldService);
  private readonly contactsService = inject(ContactsService);
  private readonly destroyRef = inject(DestroyRef);

  // Inputs
  projectId = input.required<string>();
  initialSectionId = input<string | null>(null);
  initialDueDate = input<Date | null>(null);

  // Outputs
  close = output<void>();
  created = output<Task>();

  // State
  saving = signal(false);
  errorMessage = signal<string | null>(null);
  selectedAssignees = signal<AutocompleteOption[]>([]);
  notifyAssignees = signal(true); // Default to notifying

  // AI State
  aiSubtasks = signal<Subtask[]>([]);

  // Get project sections for dropdown
  project = toSignal(
    toObservable(this.projectId).pipe(
      switchMap((id) => (id ? this.projectService.getProject$(id) : of(null))),
    ),
    { initialValue: null },
  );

  globalFields = toSignal(this.customFieldService.getCustomFields(), { initialValue: [] });

  projectCustomFields = computed(() => {
    const ids = this.project()?.customFieldIds || [];
    return this.globalFields().filter((f: CustomFieldDefinition) => ids.includes(f.id));
  });

  // Contacts for assignee autocomplete - start empty, update on search
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

  /**
   * Generate a consistent color for a contact based on their email
   * Uses a simple hash to pick from a curated color palette
   */
  private generateAvatarColor(email: string): string {
    const colors = [
      '#8b5cf6', // Purple (brand)
      '#3b82f6', // Blue
      '#06b6d4', // Cyan
      '#10b981', // Emerald
      '#f59e0b', // Amber
      '#ef4444', // Red
      '#ec4899', // Pink
      '#6366f1', // Indigo
      '#14b8a6', // Teal
      '#f97316', // Orange
    ];
    // Simple hash from email string
    const hash = email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }

  sections = signal<Section[]>([]);
  customFieldValues = signal<Record<string, any>>({});
  customFieldErrors = signal<Record<string, string>>({});
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
    const mappedSections = this.sections().map((s) => ({
      value: s.id,
      label: s.name,
      icon: '📁',
    }));
    return [defaultOption, ...mappedSections];
  });

  form = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    priority: ['low'],
    dueDate: [''],
    sectionId: [''],
  });

  constructor() {
    // Load sections when project changes
    toObservable(this.project)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((p) => {
        if (p?.sections) {
          this.sections.set(p.sections);
          // Set default section if provided or first section
          const initialSection =
            this.initialSectionId() || (p.sections.length > 0 ? p.sections[0].id : '');
          this.form.patchValue({ sectionId: initialSection });
        }
      });

    // Set initial due date if provided
    toObservable(this.initialDueDate)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((date) => {
        if (date) {
          this.form.patchValue({ dueDate: this.toInputDate(date) });
        }
      });
  }

  updateCustomField(fieldId: string, value: any) {
    const field = this.projectCustomFields().find((f: CustomFieldDefinition) => f.id === fieldId);
    if (!field) return;

    // Validate the value based on field type
    const error = this.validateCustomFieldValue(field, value);

    // Update validation errors
    this.customFieldErrors.update((errors) => {
      const newErrors = { ...errors };
      if (error) {
        newErrors[fieldId] = error;
      } else {
        delete newErrors[fieldId];
      }
      return newErrors;
    });

    // Store the value regardless (but validation will prevent submission)
    this.customFieldValues.update((v) => ({ ...v, [fieldId]: value }));
  }

  validateCustomFieldValue(field: any, value: any): string {
    // Return error message if validation fails, empty string otherwise
    let error = '';

    switch (field.type) {
      case 'currency':
      case 'number':
        // Check if value is a valid number
        if (value !== null && value !== undefined && value !== '') {
          const stringValue = String(value).trim();
          if (stringValue !== '') {
            const num = parseFloat(stringValue);
            if (isNaN(num)) {
              error = 'Must be a valid number';
            }
          }
        }
        break;

      case 'date':
        // Check if value is a valid date
        if (value !== null && value !== undefined && value !== '') {
          const stringValue = String(value).trim();
          if (stringValue !== '') {
            const date = new Date(stringValue);
            if (isNaN(date.getTime())) {
              error = 'Must be a valid date';
            }
          }
        }
        break;
    }

    return error;
  }

  getMultiSelectValues(event: Event): string[] {
    const target = event.target as HTMLSelectElement;
    return Array.from(target.selectedOptions).map((o) => o.value);
  }

  onNotifyChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.notifyAssignees.set(input.checked);
  }

  hasCustomFieldErrors(): boolean {
    return Object.keys(this.customFieldErrors()).length > 0;
  }

  /**
   * Compute available assignee options (exclude already selected)
   */
  availableAssigneeOptions = computed(() => {
    const selected = new Set(this.selectedAssignees().map((a) => a.id));
    return this.assigneeOptions().filter((opt) => !selected.has(opt.id));
  });

  /**
   * Handle assignee selection from autocomplete - adds to multi-select list
   */
  onAssigneeSelected(selection: AutocompleteOption | string): void {
    if (typeof selection === 'object') {
      // Add to selected list if not already there
      const current = this.selectedAssignees();
      if (!current.find((a) => a.id === selection.id)) {
        this.selectedAssignees.set([...current, selection]);
      }
    }
  }

  /**
   * Triggered when user types in the autocomplete
   */
  onAssigneeSearch(query: string): void {
    this.assigneeSearchSubject.next(query);
  }

  /**
   * Remove an assignee from the selected list
   */
  removeAssignee(id: string): void {
    this.selectedAssignees.update((list) => list.filter((a) => a.id !== id));
  }

  /**
   * Merge every member of a selected user group into the current assignee
   * list, skipping anyone already assigned.
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
    }
  }

  async onSubmit() {
    if (this.form.invalid) return;

    // Check for custom field validation errors
    if (this.hasCustomFieldErrors()) {
      this.errorMessage.set('Please fix the validation errors in custom fields.');
      return;
    }

    this.saving.set(true);

    this.errorMessage.set(null);

    try {
      const val = this.form.value;
      const dueDate = val.dueDate ? new Date(val.dueDate) : undefined;
      const tags = Array.from(this.selectedTags());

      const assignees = this.selectedAssignees();
      const assigneeIds = assignees.map((a) => a.id);
      const assigneeNames = assignees.map((a) => a.label);

      const selectedSection = this.sections().find((s) => s.id === val.sectionId);
      const derivedStatus = selectedSection
        ? this.taskService.getSectionStatus(selectedSection) || 'todo'
        : 'todo';

      const taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> = {
        projectId: this.projectId(),
        title: val.title!,
        description: val.description || '',
        status: derivedStatus,
        priority: val.priority as Task['priority'],
        order: 0, // Will be assigned properly
        sectionId: val.sectionId || undefined,
        // Multi-assignee fields
        assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
        assigneeNames: assigneeNames.length > 0 ? assigneeNames : undefined,
        notifyAssignees: this.notifyAssignees(),
        // Backward compat: set assignedToId to first assignee
        assignedToId: assigneeIds[0] || undefined,
        assigneeName: assigneeNames[0] || undefined,
        dueDate: dueDate as any,
        tags,
        customFieldValues: this.customFieldValues(),
        subtasks: this.aiSubtasks().length > 0 ? this.aiSubtasks() : undefined,
      };

      const ref = await this.taskService.createTask(taskData, this.project()?.googleTaskListId);

      // Emit the created task
      const newTask: Task = {
        id: ref.id,
        ...taskData,
        createdAt: new Date() as any,
        updatedAt: new Date() as any,
      };

      this.created.emit(newTask);
      this.close.emit();
    } catch (err) {
      console.error('Failed to create task:', err);
      const message =
        err instanceof Error ? err.message : 'Failed to create task. Please try again.';
      this.errorMessage.set(message);
    } finally {
      this.saving.set(false);
    }
  }

  onBackdropClick(e: Event) {
    if (e.target === e.currentTarget) {
      this.close.emit();
    }
  }

  private toInputDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}

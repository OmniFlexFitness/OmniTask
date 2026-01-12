import { Component, input, output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TaskService } from '../../core/services/task.service';
import { ProjectService } from '../../core/services/project.service';
import { Task, Project, Section, Tag } from '../../core/models/domain.model';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { switchMap, of, map } from 'rxjs';
import {
  AutocompleteInputComponent,
  AutocompleteOption,
} from '../../shared/components/autocomplete-input/autocomplete-input.component';
import { TagInputComponent } from '../../shared/components/tag-input/tag-input.component';
import { ContactsService } from '../../core/services/contacts.service';
import { SuggestionsService } from '../../core/services/suggestions.service';

@Component({
  selector: 'app-task-create-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, AutocompleteInputComponent, TagInputComponent],
  template: `
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
      (click)="onBackdropClick($event)"
    >
      <div
        class="w-full max-w-lg max-h-[90vh] flex flex-col bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
        (click)="$event.stopPropagation()"
      >
        <!-- Header -->
        <header class="px-5 py-2.5 border-b border-fuchsia-500/20 bg-[#0a0f1e]/90">
          <h2 class="text-base font-bold text-white flex items-center gap-2">
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
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Task
          </h2>
        </header>

        <!-- Body -->
        <form
          [formGroup]="form"
          (ngSubmit)="onSubmit()"
          class="flex-1 overflow-y-auto p-4 space-y-3"
        >
          <!-- Title -->
          <div>
            <label
              class="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1"
              >Task Name *</label
            >
            <input
              type="text"
              formControlName="title"
              placeholder="What needs to be done?"
              class="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              autofocus
            />
            @if (form.controls.title.touched && form.controls.title.invalid) {
            <p class="text-xs text-rose-400 mt-1">Task name is required</p>
            }
          </div>

          <!-- Description -->
          <div>
            <label
              class="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1"
              >Description</label
            >
            <textarea
              formControlName="description"
              rows="2"
              placeholder="Add more details..."
              class="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors resize-none"
            ></textarea>
          </div>

          <!-- Two Column Grid -->
          <div class="grid grid-cols-2 gap-3">
            <!-- Priority -->
            <div>
              <label
                class="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1"
                >Priority</label
              >
              <select
                formControlName="priority"
                class="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              >
                <option value="low">🟢 Low</option>
                <option value="medium">🟡 Medium</option>
                <option value="high">🔴 High</option>
              </select>
            </div>

            <!-- Due Date -->
            <div>
              <label
                class="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1"
                >Due Date</label
              >
              <input
                type="date"
                formControlName="dueDate"
                class="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              />
            </div>
          </div>

          <!-- Section (for Board view) -->
          @if (sections().length > 0) {
          <div>
            <label
              class="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1"
              >Section</label
            >
            <select
              formControlName="sectionId"
              class="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
            >
              @for (section of sections(); track section.id) {
              <option [value]="section.id">{{ section.name }}</option>
              }
            </select>
          </div>
          }

          <!-- Custom Fields -->
          @if (project()?.customFields?.length) {
          <div class="grid grid-cols-2 gap-3">
            @for (field of project()?.customFields; track field.id) {
            <div>
              <label
                class="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1"
                >{{ field.name }}</label
              >

              @switch (field.type) { @case ('text') {
              <input
                type="text"
                [attr.id]="field.id"
                (input)="updateCustomField(field.id, $any($event.target).value)"
                class="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              />
              } @case ('number') {
              <input
                type="number"
                (input)="updateCustomField(field.id, $any($event.target).value)"
                class="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              />
              } @case ('date') {
              <input
                type="date"
                (input)="updateCustomField(field.id, $any($event.target).value)"
                class="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              />
              } @case ('dropdown') {
              <select
                (change)="updateCustomField(field.id, $any($event.target).value)"
                class="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              >
                <option value="">- Select -</option>
                @for (opt of field.options; track opt.id) {
                <option [value]="opt.id">{{ opt.label }}</option>
                }
              </select>
              } @case ('status') {
              <select
                (change)="updateCustomField(field.id, $any($event.target).value)"
                class="w-full bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              >
                <option value="">- Select -</option>
                @for (opt of field.options; track opt.id) {
                <option [value]="opt.id">{{ opt.label }}</option>
                }
              </select>
              } }
            </div>
            }
          </div>
          }

          <!-- Assignee with Autocomplete -->
          <div>
            <label
              class="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1"
              >Assignee</label
            >
            <app-autocomplete-input
              [options]="contactOptions()"
              [value]="form.controls.assigneeName.value"
              (valueChange)="form.patchValue({ assigneeName: $event })"
              placeholder="Who is responsible?"
              [allowCustom]="true"
            ></app-autocomplete-input>
          </div>

          <!-- Tags with Autocomplete -->
          <div>
            <label
              class="block text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1"
              >Tags</label
            >
            <app-tag-input
              [availableTags]="allTags()"
              [selectedTags]="selectedTagObjects()"
              (tagsChange)="onTagsChange($event)"
              (tagCreated)="onTagCreated($event)"
              placeholder="Add tags..."
            ></app-tag-input>
          </div>

          <!-- Error Message -->
          @if (errorMessage()) {
          <div
            class="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm"
          >
            {{ errorMessage() }}
          </div>
          }

          <!-- Actions -->
          <div class="flex justify-end gap-3 pt-4 border-t border-white/5">
            <button
              type="button"
              class="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              (click)="close.emit()"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              [disabled]="form.invalid || saving()"
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [
    `
      @keyframes scaleIn {
        from {
          transform: scale(0.95);
          opacity: 0;
        }
        to {
          transform: scale(1);
          opacity: 1;
        }
      }
      .animate-scale-in {
        animation: scaleIn 0.2s ease-out;
      }
    `,
  ],
})
export class TaskCreateModalComponent {
  private fb = inject(FormBuilder);
  private taskService = inject(TaskService);
  private projectService = inject(ProjectService);
  private contactsService = inject(ContactsService);
  private suggestionsService = inject(SuggestionsService);

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

  // Get project sections for dropdown
  project = toSignal(
    toObservable(this.projectId).pipe(
      switchMap((id) => (id ? this.projectService.getProject$(id) : of(null)))
    ),
    { initialValue: null }
  );

  sections = signal<Section[]>([]);
  customFieldValues = signal<Record<string, any>>({});

  // Tag handling
  selectedTagObjects = signal<Tag[]>([]); // Full tag objects for the UI

  // Available tags for autocomplete
  allTags = toSignal(this.suggestionsService.getAllTags(), { initialValue: [] });

  // Contacts for autocomplete
  contactOptions = toSignal(
    this.contactsService.getContacts().pipe(
      map((contacts) =>
        contacts.map(
          (c) =>
            ({
              id: c.email,
              label: c.displayName,
              sublabel: c.email,
              avatar: c.photoURL,
              color: undefined, // Could generate color from name if needed
            } as AutocompleteOption)
        )
      )
    ),
    { initialValue: [] }
  );

  form = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    priority: ['low'],
    dueDate: [''],
    sectionId: [''],
    assigneeName: [''],
    tags: [''], // Hidden field for form validity if needed, but we use selectedTagObjects mainly
  });

  constructor() {
    // Load sections when project changes
    toObservable(this.project).subscribe((p) => {
      if (p?.sections) {
        this.sections.set(p.sections);
        // Set default section if provided or first section
        const initialSection =
          this.initialSectionId() || (p.sections.length > 0 ? p.sections[0].id : '');
        this.form.patchValue({ sectionId: initialSection });
      }
    });

    // Set initial due date if provided
    toObservable(this.initialDueDate).subscribe((date) => {
      if (date) {
        this.form.patchValue({ dueDate: this.toInputDate(date) });
      }
    });
  }

  updateCustomField(fieldId: string, value: any) {
    this.customFieldValues.update((v) => ({ ...v, [fieldId]: value }));
  }

  onTagsChange(tags: Tag[]) {
    this.selectedTagObjects.set(tags);
  }

  async onTagCreated(name: string) {
    const project = this.project();
    if (!project) return;

    // Create random color
    const colors = ['#f472b6', '#34d399', '#60a5fa', '#a78bfa', '#fbbf24', '#f87171'];
    const colorIndex =
      name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;

    try {
      const newTag = await this.projectService.addTag(project.id, {
        name,
        color: colors[colorIndex],
      });

      this.selectedTagObjects.update((tags) => [...tags, newTag]);
    } catch (e) {
      console.error('Failed to create tag', e);
    }
  }

  async onSubmit() {
    if (this.form.invalid) return;

    this.saving.set(true);

    this.errorMessage.set(null);

    try {
      const val = this.form.value;
      const dueDate = val.dueDate ? new Date(val.dueDate) : undefined;
      // Convert Tag objects to string names
      const tags = this.selectedTagObjects().map((t) => t.name);

      const taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'> = {
        projectId: this.projectId(),
        title: val.title!,
        description: val.description || '',
        status: 'todo',
        priority: val.priority as Task['priority'],
        order: 0, // Will be assigned properly
        sectionId: val.sectionId || undefined,
        assigneeName: val.assigneeName || undefined,
        dueDate: dueDate as any,
        tags,
        customFieldValues: this.customFieldValues(),
      };

      const ref = await this.taskService.createTask(taskData);

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

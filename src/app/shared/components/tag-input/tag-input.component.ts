import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OverlayModule } from '@angular/cdk/overlay';
import { Tag } from '../../../core/models/domain.model';

@Component({
  selector: 'app-tag-input',
  standalone: true,
  imports: [CommonModule, FormsModule, OverlayModule],
  template: `
    <div class="w-full">
      <!-- Selected Tags Area -->
      @if (selectedTags.length > 0) {
      <div class="flex flex-wrap gap-2 mb-2">
        @for (tag of selectedTags; track tag.name) {
        <div
          class="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border transition-all animate-scale-in"
          [style.background-color]="tag.color + '20'"
          [style.color]="tag.color"
          [style.border-color]="tag.color + '40'"
        >
          <span>{{ tag.name }}</span>
          <button
            type="button"
            (click)="removeTag(tag)"
            class="hover:text-white rounded-full p-0.5 hover:bg-black/20 transition-colors"
            title="Remove tag"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-3 w-3"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L10 8.586 5.707 4.293a1 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>
        }
      </div>
      }

      <!-- Input and Autocomplete -->
      <div class="relative" cdkOverlayOrigin #trigger="cdkOverlayOrigin">
        <div class="flex items-center gap-2">
          <input
            #tagInput
            type="text"
            [placeholder]="placeholder"
            [(ngModel)]="inputValue"
            (input)="onInput()"
            (focus)="onFocus()"
            (keydown)="onKeydown($event)"
            class="flex-1 bg-slate-950/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-300 placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
          />

          <button
            type="button"
            [disabled]="!inputValue.trim()"
            (click)="addTagFromInput()"
            class="px-3 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
        </div>

        <!-- Dropdown -->
        <ng-template
          cdkConnectedOverlay
          [cdkConnectedOverlayOrigin]="trigger"
          [cdkConnectedOverlayOpen]="isOpen()"
          [cdkConnectedOverlayWidth]="trigger.elementRef.nativeElement.offsetWidth"
          (overlayOutsideClick)="close()"
        >
          <div
            class="mt-1 bg-slate-900 border border-white/10 rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto z-50"
          >
            @if (filteredTags().length > 0) {
            <ul class="py-1">
              @for (tag of filteredTags(); track tag.name; let i = $index) {
              <li
                (click)="selectTag(tag)"
                class="px-3 py-2 cursor-pointer flex items-center justify-between transition-colors"
                [class.bg-slate-800]="i === activeIndex()"
              >
                <div class="flex items-center gap-2">
                  <span class="w-3 h-3 rounded-full" [style.background-color]="tag.color"></span>
                  <span class="text-sm text-slate-300">{{ tag.name }}</span>
                </div>
                @if (isTagSelected(tag)) {
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4 text-cyan-500"
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
              </li>
              }
            </ul>
            } @else {
            <div class="px-3 py-2 text-sm text-slate-500">
              @if (inputValue.trim()) { Press Enter to create new tag "{{ inputValue }}" } @else {
              Type to add tags }
            </div>
            }
          </div>
        </ng-template>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      @keyframes scaleIn {
        from {
          transform: scale(0.9);
          opacity: 0;
        }
        to {
          transform: scale(1);
          opacity: 1;
        }
      }
      .animate-scale-in {
        animation: scaleIn 0.15s ease-out;
      }
    `,
  ],
})
export class TagInputComponent {
  @Input() availableTags: Tag[] = [];
  @Input() selectedTags: Tag[] = [];
  @Input() placeholder: string = 'Add tags...';

  @Output() tagsChange = new EventEmitter<Tag[]>();
  @Output() tagCreated = new EventEmitter<string>();

  @ViewChild('tagInput') inputEl!: ElementRef<HTMLInputElement>;

  inputValue = '';
  isOpen = signal(false);
  activeIndex = signal(0);

  filteredTags = computed(() => {
    const query = this.inputValue.toLowerCase().trim();
    return this.availableTags.filter(
      (tag) =>
        tag.name.toLowerCase().includes(query) &&
        !this.selectedTags.some((selected) => selected.name === tag.name)
    );
  });

  isTagSelected(tag: Tag): boolean {
    return this.selectedTags.some((t) => t.name === tag.name);
  }

  onInput() {
    this.isOpen.set(true);
    this.activeIndex.set(0);
  }

  onFocus() {
    if (this.availableTags.length > 0) {
      this.isOpen.set(true);
    }
  }

  close() {
    this.isOpen.set(false);
    this.activeIndex.set(-1);
  }

  selectTag(tag: Tag) {
    if (!this.isTagSelected(tag)) {
      this.tagsChange.emit([...this.selectedTags, tag]);
    }
    this.clearInput();
  }

  removeTag(tagToRemove: Tag) {
    const newTags = this.selectedTags.filter((tag) => tag.name !== tagToRemove.name);
    this.tagsChange.emit(newTags);
  }

  addTagFromInput() {
    const name = this.inputValue.trim();
    if (!name) return;

    // Check if it's an existing tag first (case insensitive)
    const existingTag = this.availableTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existingTag) {
      this.selectTag(existingTag);
    } else {
      // It's a new tag
      this.tagCreated.emit(name);
      // Wait for parent to handle creation and update selectedTags
      // But we clear input immediately for better UX
      this.clearInput();
    }
  }

  private clearInput() {
    this.inputValue = '';
    this.isOpen.set(false);
    setTimeout(() => this.inputEl.nativeElement.focus(), 0);
  }

  onKeydown(event: KeyboardEvent) {
    if (!this.isOpen() && event.key !== 'Enter') return;

    const options = this.filteredTags();

    switch (event.key) {
      case 'ArrowDown':
        if (!this.isOpen()) {
          this.isOpen.set(true);
          return;
        }
        this.activeIndex.update((i) => (i + 1) % options.length);
        event.preventDefault();
        break;
      case 'ArrowUp':
        if (!this.isOpen()) return;
        this.activeIndex.update((i) => (i - 1 + options.length) % options.length);
        event.preventDefault();
        break;
      case 'Enter':
        event.preventDefault();
        if (this.isOpen() && options.length > 0 && this.activeIndex() >= 0) {
          this.selectTag(options[this.activeIndex()]);
        } else if (this.inputValue.trim()) {
          this.addTagFromInput();
        }
        break;
      case 'Escape':
        this.close();
        break;
      case 'Backspace':
        if (!this.inputValue && this.selectedTags.length > 0) {
          // Remove last tag on backspace if input is empty
          this.removeTag(this.selectedTags[this.selectedTags.length - 1]);
        }
        break;
    }
  }
}

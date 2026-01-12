import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  ElementRef,
  ViewChild,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkOverlayOrigin, OverlayModule } from '@angular/cdk/overlay';

export interface AutocompleteOption {
  id: string;
  label: string;
  sublabel?: string;
  color?: string;
  avatar?: string;
}

@Component({
  selector: 'app-autocomplete-input',
  standalone: true,
  imports: [CommonModule, FormsModule, OverlayModule],
  template: `
    <div class="relative w-full">
      <!-- Input Field -->
      <div
        class="flex items-center gap-2 w-full bg-slate-950/50 border rounded-lg px-3 py-2 transition-colors"
        [class.border-cyan-500]="isOpen()"
        [class.ring-1]="isOpen()"
        [class.ring-cyan-500]="isOpen()"
        [class.border-white-10]="!isOpen()"
        [class.border-white-10]="!isOpen()"
        cdkOverlayOrigin
        #trigger="cdkOverlayOrigin"
      >
        <!-- Optional Icon/Avatar prefix -->
        @if (selectedOption()) {
        <div class="flex-shrink-0">
          @if (selectedOption()?.avatar) {
          <img [src]="selectedOption()!.avatar" class="w-5 h-5 rounded-full object-cover" />
          } @else if (selectedOption()?.color) {
          <div
            class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            [style.background-color]="selectedOption()!.color"
          >
            {{ selectedOption()!.label.charAt(0).toUpperCase() }}
          </div>
          }
        </div>
        }

        <input
          #inputEl
          type="text"
          [placeholder]="placeholder"
          [value]="displayValue()"
          (input)="onInput($event)"
          (focus)="onFocus()"
          (keydown)="onKeydown($event)"
          class="w-full bg-transparent border-none p-0 text-sm text-slate-300 placeholder-slate-500 focus:ring-0 focus:outline-none"
        />

        <!-- Loading Spinner -->
        <!-- Clear Button -->
        @if (displayValue()) {
        <button
          tabindex="-1"
          type="button"
          (click)="clear()"
          class="text-slate-500 hover:text-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
        }
      </div>

      <!-- Dropdown Overlay -->
      <ng-template
        cdkConnectedOverlay
        [cdkConnectedOverlayOrigin]="trigger"
        [cdkConnectedOverlayOpen]="isOpen()"
        [cdkConnectedOverlayWidth]="trigger.elementRef.nativeElement.offsetWidth"
        (overlayOutsideClick)="close()"
      >
        <div
          class="mt-1 bg-slate-900 border border-white/10 rounded-lg shadow-xl overflow-hidden max-h-60 overflow-y-auto z-50"
        >
          <!-- Loading State -->
          <!-- @if (loading) { ... } -->

          @if (filteredOptions().length > 0) {
          <ul class="py-1">
            @for (option of filteredOptions(); track option.id; let i = $index) {
            <li
              (click)="selectOption(option)"
              class="px-3 py-2 cursor-pointer flex items-center gap-3 transition-colors"
              [class.bg-slate-800]="i === activeIndex()"
              [class.text-cyan-400]="i === activeIndex()"
              [class.text-slate-300]="i !== activeIndex()"
              (mousemove)="activeIndex.set(i)"
            >
              <!-- Avatar/Color -->
              <div class="flex-shrink-0">
                @if (option.avatar) {
                <img [src]="option.avatar" class="w-8 h-8 rounded-full object-cover bg-slate-800" />
                } @else if (option.color) {
                <div
                  class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm"
                  [style.background-color]="option.color"
                >
                  {{ option.label.charAt(0).toUpperCase() }}
                </div>
                } @else {
                <div
                  class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-400"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </div>
                }
              </div>

              <!-- Text -->
              <div class="flex flex-col min-w-0 flex-1">
                <span class="text-sm font-medium truncate">{{ option.label }}</span>
                @if (option.sublabel) {
                <span class="text-xs text-slate-500 truncate">{{ option.sublabel }}</span>
                }
              </div>

              <!-- Checkmark if currently selected (optional, maybe distracting) -->
            </li>
            }
          </ul>
          } @else {
          <!-- No results -->
          <div class="px-3 py-3 text-sm text-slate-500 text-center">
            @if (allowCustom && inputValue().trim()) { Press
            <span class="font-bold text-slate-400">Enter</span> to use "{{ inputValue() }}" } @else
            { No matches found }
          </div>
          }
        </div>
      </ng-template>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class AutocompleteInputComponent {
  @Input() options: AutocompleteOption[] = [];
  @Input() placeholder: string = '';
  @Input() allowCustom: boolean = false;

  // Value can be a string (custom/ID) or an Option object
  @Input() set value(val: string | null | undefined) {
    // If value matches an existing option ID or Label, try to reconstruct selection
    if (val !== this.currentValue) {
      this.currentValue = val || '';
      this.syncDisplayValue();
    }
  }

  @Output() optionSelected = new EventEmitter<AutocompleteOption | string>();
  @Output() valueChange = new EventEmitter<string>();

  @ViewChild('inputEl') inputEl!: ElementRef<HTMLInputElement>;

  // Internal state
  isOpen = signal(false);
  inputValue = signal('');
  selectedOption = signal<AutocompleteOption | null>(null);
  activeIndex = signal(-1);

  private currentValue: string = '';

  // Filter options based on input
  filteredOptions = computed(() => {
    const query = this.inputValue().toLowerCase().trim();
    if (!query) return this.options;

    return this.options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) || opt.sublabel?.toLowerCase().includes(query)
    );
  });

  // Display value logic
  displayValue = computed(() => {
    // If user is typing/interacting, show what they type
    if (this.isOpen()) {
      return this.inputValue();
    }
    // Otherwise show selected option label
    return this.selectedOption()?.label || this.inputValue();
  });

  private syncDisplayValue() {
    if (!this.currentValue) {
      this.selectedOption.set(null);
      this.inputValue.set('');
      return;
    }

    // Try to find matching option by ID or Label (fuzzy match on label if ID fails)
    const match = this.options.find(
      (o) => o.id === this.currentValue || o.label === this.currentValue
    );

    if (match) {
      this.selectedOption.set(match);
      this.inputValue.set(match.label);
    } else {
      // Custom value
      this.selectedOption.set(null);
      this.inputValue.set(this.currentValue);
    }
  }

  onInput(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    this.inputValue.set(val);
    this.activeIndex.set(0);

    if (!this.isOpen()) {
      this.isOpen.set(true);
    }

    // If custom values allowed, emit immediately
    if (this.allowCustom) {
      this.valueChange.emit(val);
    }
  }

  onFocus() {
    this.isOpen.set(true);
    // If empty input, show all options
    if (!this.inputValue() && this.selectedOption()) {
      // If we have a selection but start editing, maybe clear input or keep it?
      // Usual behavior: select text or clear it. Let's keep it for now.
    }
  }

  close() {
    this.isOpen.set(false);
    this.activeIndex.set(-1);

    // On close, validate
    if (!this.selectedOption() && !this.allowCustom) {
      // Revert to known value or clear
      this.inputValue.set('');
      this.valueChange.emit('');
    } else if (this.selectedOption()) {
      this.inputValue.set(this.selectedOption()!.label);
    }
  }

  clear() {
    this.inputValue.set('');
    this.selectedOption.set(null);
    this.currentValue = '';
    this.valueChange.emit('');
    this.optionSelected.emit('');
    this.inputEl.nativeElement.focus();
  }

  selectOption(option: AutocompleteOption) {
    this.selectedOption.set(option);
    this.inputValue.set(option.label);
    this.currentValue = option.id; // Or label? Typically ID.

    this.valueChange.emit(option.label); // Sending label as value for now based on legacy usage
    this.optionSelected.emit(option);

    this.isOpen.set(false);
  }

  onKeydown(event: KeyboardEvent) {
    if (!this.isOpen()) {
      if (event.key === 'ArrowDown' || event.key === 'Enter') {
        this.isOpen.set(true);
        event.preventDefault();
      }
      return;
    }

    const options = this.filteredOptions();

    switch (event.key) {
      case 'ArrowDown':
        this.activeIndex.update((i) => (i + 1) % options.length);
        event.preventDefault();
        break;
      case 'ArrowUp':
        this.activeIndex.update((i) => (i - 1 + options.length) % options.length);
        event.preventDefault();
        break;
      case 'Enter':
        event.preventDefault();
        if (this.activeIndex() >= 0 && options[this.activeIndex()]) {
          this.selectOption(options[this.activeIndex()]);
        } else if (this.allowCustom && this.inputValue().trim()) {
          // Confirm custom value
          this.close();
          this.valueChange.emit(this.inputValue());
          this.optionSelected.emit(this.inputValue());
        }
        break;
      case 'Escape':
        this.close();
        event.preventDefault();
        break;
      case 'Tab':
        this.close();
        break;
    }
  }
}

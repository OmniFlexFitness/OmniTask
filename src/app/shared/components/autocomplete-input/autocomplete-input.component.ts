import { Component, Input, Output, EventEmitter, signal, computed, ElementRef, ViewChild, HostListener, ChangeDetectionStrategy } from '@angular/core';
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
  templateUrl: './autocomplete-input.component.html',
  styleUrls: ['./autocomplete-input.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  @Output() search = new EventEmitter<string>();

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
        opt.label.toLowerCase().includes(query) || opt.sublabel?.toLowerCase().includes(query),
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
      (o) => o.id === this.currentValue || o.label === this.currentValue,
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

    // Always emit search event for predictive typing
    this.search.emit(val);

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

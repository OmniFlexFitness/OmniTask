import { Component, Input, Output, EventEmitter, signal, computed, ElementRef, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OverlayModule } from '@angular/cdk/overlay';
import { Tag } from '../../../core/models/domain.model';

@Component({
  selector: 'app-tag-input',
  standalone: true,
  imports: [CommonModule, FormsModule, OverlayModule],
  templateUrl: './tag-input.component.html',
  styleUrls: ['./tag-input.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
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

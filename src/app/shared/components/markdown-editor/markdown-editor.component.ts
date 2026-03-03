import {
  Component,
  input,
  output,
  signal,
  computed,
  ElementRef,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarkdownPipe } from '../../pipes/markdown.pipe';

/**
 * Reusable markdown editor with always-visible formatting toolbar
 * and live rendered preview below the editing area.
 *
 * Supports GitHub Flavored Markdown + Obsidian-style features:
 * - Bold, italic, strikethrough, highlight
 * - Headings (H1–H3), blockquotes, callouts
 * - Bulleted/numbered/task lists
 * - Code (inline + fenced blocks)
 * - Links, images, tables
 * - Horizontal rules
 *
 * Keyboard shortcuts: Ctrl+B (bold), Ctrl+I (italic), Ctrl+K (link),
 * Ctrl+E (inline code), Tab (indent)
 */
@Component({
  selector: 'app-markdown-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MarkdownPipe],
  template: `
    <div class="md-editor" [class.md-editor-minimal]="minimal()">
      <!-- Toolbar — always visible -->
      <div class="md-toolbar" [class.md-toolbar-minimal]="minimal()">
        <!-- Undo -->
        <button
          type="button"
          tabindex="-1"
          class="md-btn"
          [class.md-btn-disabled]="!canUndo()"
          title="Undo (Ctrl+Z)"
          (click)="undo()"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="md-svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4"
            />
          </svg>
        </button>

        <!-- Redo -->
        <button
          type="button"
          tabindex="-1"
          class="md-btn"
          [class.md-btn-disabled]="!canRedo()"
          title="Redo (Ctrl+Y)"
          (click)="redo()"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="md-svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4"
            />
          </svg>
        </button>

        <span class="md-divider"></span>

        <!-- Bold -->
        <button
          type="button"
          tabindex="-1"
          class="md-btn"
          title="Bold (Ctrl+B)"
          (click)="wrapSelection('**', '**')"
        >
          <span class="md-icon-bold">B</span>
        </button>

        <!-- Italic -->
        <button
          type="button"
          tabindex="-1"
          class="md-btn"
          title="Italic (Ctrl+I)"
          (click)="wrapSelection('*', '*')"
        >
          <span class="md-icon-italic">I</span>
        </button>

        <!-- Strikethrough -->
        <button
          type="button"
          tabindex="-1"
          class="md-btn"
          title="Strikethrough"
          (click)="wrapSelection('~~', '~~')"
        >
          <span class="md-icon-strike">S</span>
        </button>

        <!-- Highlight -->
        <button
          type="button"
          tabindex="-1"
          class="md-btn"
          title="Highlight"
          (click)="wrapSelection('==', '==')"
        >
          <span class="md-icon-highlight">H</span>
        </button>

        <span class="md-divider"></span>

        <!-- Heading -->
        <button
          type="button"
          tabindex="-1"
          class="md-btn"
          title="Heading"
          (click)="insertPrefix('## ')"
        >
          <span class="md-icon-bold" style="font-size:10px">H2</span>
        </button>

        <!-- Blockquote -->
        <button
          type="button"
          tabindex="-1"
          class="md-btn"
          title="Blockquote"
          (click)="insertPrefix('> ')"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="md-svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        </button>

        <span class="md-divider"></span>

        <!-- Bulleted list -->
        <button
          type="button"
          tabindex="-1"
          class="md-btn"
          title="Bulleted list"
          (click)="insertPrefix('- ')"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="md-svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>

        <!-- Numbered list -->
        <button
          type="button"
          tabindex="-1"
          class="md-btn"
          title="Numbered list"
          (click)="insertPrefix('1. ')"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="md-svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M7 8h10M7 12h10M7 16h10M3 8h.01M3 12h.01M3 16h.01"
            />
          </svg>
        </button>

        <!-- Task list -->
        <button
          type="button"
          tabindex="-1"
          class="md-btn"
          title="Task list"
          (click)="insertPrefix('- [ ] ')"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="md-svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
        </button>

        <span class="md-divider"></span>

        <!-- Code inline -->
        <button
          type="button"
          tabindex="-1"
          class="md-btn"
          title="Inline code (Ctrl+E)"
          (click)="wrapSelection('\`', '\`')"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="md-svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
            />
          </svg>
        </button>

        <!-- Code block -->
        <button
          type="button"
          tabindex="-1"
          class="md-btn"
          title="Code block"
          (click)="insertCodeBlock()"
        >
          <span class="md-icon-mono">{{ codeBlockLabel }}</span>
        </button>

        <!-- Link -->
        <button
          type="button"
          tabindex="-1"
          class="md-btn"
          title="Link (Ctrl+K)"
          (click)="insertLink()"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="md-svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
        </button>

        <!-- Table -->
        <button
          type="button"
          tabindex="-1"
          class="md-btn"
          title="Insert table"
          (click)="insertTable()"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="md-svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M3 10h18M3 14h18M10 3v18M14 3v18M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6z"
            />
          </svg>
        </button>

        <!-- Horizontal rule -->
        <button
          type="button"
          tabindex="-1"
          class="md-btn"
          title="Horizontal rule"
          (click)="insertHorizontalRule()"
        >
          <span class="md-icon-hr">—</span>
        </button>

        @if (!minimal()) {
          <!-- Callout (full mode only to save space) -->
          <button
            type="button"
            tabindex="-1"
            class="md-btn"
            title="Callout"
            (click)="insertCallout()"
          >
            <span class="md-icon-callout">📝</span>
          </button>
        }
      </div>

      <!-- Textarea (always visible) -->
      <textarea
        #textareaRef
        [rows]="rows()"
        [placeholder]="placeholder()"
        [ngModel]="value()"
        (ngModelChange)="onValueChange($event)"
        (blur)="blurred.emit()"
        (keydown)="onKeydown($event)"
        class="md-textarea"
        [class.md-textarea-minimal]="minimal()"
      ></textarea>

      <!-- Live Preview (shown when there is content) -->
      @if (hasContent()) {
        <div
          class="md-live-preview"
          [class.md-live-preview-minimal]="minimal()"
          [innerHTML]="value() | markdown"
        ></div>
      }
    </div>
  `,
  styleUrls: ['./markdown-editor.component.css'],
})
export class MarkdownEditorComponent {
  /** Current markdown content */
  value = input<string>('');
  /** Textarea row count */
  rows = input<number>(6);
  /** Placeholder text */
  placeholder = input<string>('Write markdown...');
  /** Minimal mode — smaller padding, fewer buttons (but toolbar still visible) */
  minimal = input<boolean>(false);

  /** Emitted on every content change */
  valueChange = output<string>();
  /** Emitted when the textarea loses focus */
  blurred = output<void>();

  /** Reference to the textarea */
  textareaRef = viewChild<ElementRef<HTMLTextAreaElement>>('textareaRef');

  /** Label for the code block button — avoids {} in template */
  readonly codeBlockLabel = '{ }';

  /** Whether there is content to preview */
  hasContent = computed(() => (this.value() ?? '').trim().length > 0);

  /**
   * Undo/redo with VS Code-style segmentation.
   * New undo boundaries are inserted on:
   *  1. Word boundaries (space/punctuation typed after alphanumeric, or vice versa)
   *  2. Newlines (Enter key)
   *  3. Switching between insertion and deletion (Backspace/Delete)
   *  4. Cursor jumps (click or arrow-key repositioning)
   *  5. Idle timeout (300ms pause while typing)
   *  6. Toolbar actions (immediate discrete steps)
   */
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private isUndoRedo = false;
  private pendingSnapshot: string | null = null;
  private lastCharType: 'alnum' | 'space' | 'punct' | 'newline' | 'delete' | 'none' = 'none';
  private lastCursorPos = -1;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  canUndo = signal(false);
  canRedo = signal(false);

  /** Classify a character for word-boundary detection */
  private classifyChar(ch: string): 'alnum' | 'space' | 'punct' | 'newline' {
    if (ch === '\n' || ch === '\r') return 'newline';
    if (/\s/.test(ch)) return 'space';
    if (/[\w]/.test(ch)) return 'alnum';
    return 'punct';
  }

  /** Commit the pending snapshot to the undo stack */
  private commitSnapshot(): void {
    if (this.pendingSnapshot !== null) {
      this.undoStack.push(this.pendingSnapshot);
      if (this.undoStack.length > 100) this.undoStack.shift();
      this.pendingSnapshot = null;
    }
    this.clearIdleTimer();
    this.canUndo.set(this.undoStack.length > 0);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private startIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.commitSnapshot();
    }, 300);
  }

  /**
   * Called on every user keystroke change.
   * Determines whether to start a new undo group based on multiple heuristics.
   */
  private pushHistorySmart(beforeValue: string, newValue: string): void {
    if (this.isUndoRedo) return;

    const ta = this.textareaRef()?.nativeElement;
    const cursorPos = ta?.selectionStart ?? -1;

    // Determine what kind of edit this was
    const lenDiff = newValue.length - beforeValue.length;
    let currentCharType: 'alnum' | 'space' | 'punct' | 'newline' | 'delete' = 'none' as any;

    if (lenDiff < 0) {
      // Deletion (backspace or delete)
      currentCharType = 'delete';
    } else if (lenDiff > 0) {
      // Insertion — classify the inserted character(s)
      const insertedChar = newValue.charAt(Math.max(0, cursorPos - 1));
      currentCharType = this.classifyChar(insertedChar);
    } else {
      // Same length (replace) — treat as new group
      currentCharType = 'punct';
    }

    // Determine if we should start a new undo group
    let shouldBreak = false;

    // 1. First edit ever — just start tracking
    if (this.pendingSnapshot === null) {
      this.pendingSnapshot = beforeValue;
      this.lastCharType = currentCharType;
      this.lastCursorPos = cursorPos;
      this.startIdleTimer();
      this.redoStack.length = 0;
      this.canRedo.set(false);
      return;
    }

    // 2. Newline always starts a new group
    if (currentCharType === 'newline') {
      shouldBreak = true;
    }

    // 3. Switching between insertion and deletion
    if (
      (this.lastCharType === 'delete' && currentCharType !== 'delete') ||
      (this.lastCharType !== 'delete' && currentCharType === 'delete')
    ) {
      shouldBreak = true;
    }

    // 4. Word boundary: transition between alphanumeric and space/punctuation
    if (!shouldBreak && currentCharType !== 'delete') {
      const isCurrentWord = currentCharType === 'alnum';
      const wasWord = this.lastCharType === 'alnum';
      if (
        isCurrentWord !== wasWord &&
        this.lastCharType !== 'none' &&
        this.lastCharType !== 'delete'
      ) {
        shouldBreak = true;
      }
    }

    // 5. Cursor jump (non-sequential position change, e.g. click or arrow keys)
    if (!shouldBreak && this.lastCursorPos >= 0) {
      const expectedPos = this.lastCursorPos + lenDiff;
      if (Math.abs(cursorPos - expectedPos) > 1) {
        shouldBreak = true;
      }
    }

    // 6. Large paste (inserted more than 2 chars at once)
    if (!shouldBreak && lenDiff > 2) {
      shouldBreak = true;
    }

    if (shouldBreak) {
      this.commitSnapshot();
      this.pendingSnapshot = beforeValue;
    }

    this.lastCharType = currentCharType;
    this.lastCursorPos = cursorPos;
    this.startIdleTimer();
    this.redoStack.length = 0;
    this.canRedo.set(false);
  }

  /**
   * Immediately push a snapshot (used by toolbar actions like bold, link, etc.)
   * so each formatting action is a discrete undo step.
   */
  pushHistoryImmediate(before: string): void {
    if (this.isUndoRedo) return;
    this.commitSnapshot();
    this.undoStack.push(before);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
    this.canUndo.set(true);
    this.canRedo.set(false);
    this.lastCharType = 'none';
  }

  undo(): void {
    if (this.undoStack.length === 0 && this.pendingSnapshot === null) return;
    this.commitSnapshot();
    if (this.undoStack.length === 0) return;
    const current = this.value() ?? '';
    this.redoStack.push(current);
    const prev = this.undoStack.pop()!;
    this.isUndoRedo = true;
    this.valueChange.emit(prev);
    this.isUndoRedo = false;
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
    this.lastCharType = 'none';
    this.lastCursorPos = -1;
    requestAnimationFrame(() => this.textareaRef()?.nativeElement?.focus());
  }

  redo(): void {
    if (this.redoStack.length === 0) return;
    const current = this.value() ?? '';
    this.undoStack.push(current);
    const next = this.redoStack.pop()!;
    this.isUndoRedo = true;
    this.valueChange.emit(next);
    this.isUndoRedo = false;
    this.canUndo.set(this.undoStack.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
    this.lastCharType = 'none';
    this.lastCursorPos = -1;
    requestAnimationFrame(() => this.textareaRef()?.nativeElement?.focus());
  }

  onValueChange(newValue: string): void {
    const before = this.value() ?? '';
    this.pushHistorySmart(before, newValue);
    const ta = this.textareaRef()?.nativeElement;
    if (ta) ta.value = newValue;
    this.valueChange.emit(newValue);
  }

  /** Handle keyboard shortcuts */
  onKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey) {
      switch (event.key.toLowerCase()) {
        case 'z':
          event.preventDefault();
          if (event.shiftKey) {
            this.redo();
          } else {
            this.undo();
          }
          break;
        case 'y':
          event.preventDefault();
          this.redo();
          break;
        case 'b':
          event.preventDefault();
          this.wrapSelection('**', '**');
          break;
        case 'i':
          event.preventDefault();
          this.wrapSelection('*', '*');
          break;
        case 'k':
          event.preventDefault();
          this.insertLink();
          break;
        case 'e':
          event.preventDefault();
          this.wrapSelection('`', '`');
          break;
      }
    }
    // Tab to insert spaces
    if (event.key === 'Tab') {
      event.preventDefault();
      this.insertText('  ');
    }
  }

  /** Wrap selected text with prefix/suffix */
  wrapSelection(prefix: string, suffix: string): void {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) return;
    this.pushHistoryImmediate(ta.value);

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    const selected = text.substring(start, end);

    const replacement = `${prefix}${selected || 'text'}${suffix}`;
    const newValue = text.substring(0, start) + replacement + text.substring(end);

    ta.value = newValue;
    this.valueChange.emit(newValue);

    requestAnimationFrame(() => {
      ta.focus();
      if (selected) {
        ta.setSelectionRange(start, start + replacement.length);
      } else {
        ta.setSelectionRange(start + prefix.length, start + prefix.length + 4);
      }
    });
  }

  /** Insert prefix at the beginning of the current line */
  insertPrefix(prefix: string): void {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) return;
    this.pushHistoryImmediate(ta.value);

    const start = ta.selectionStart;
    const text = ta.value;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;

    const newValue = text.substring(0, lineStart) + prefix + text.substring(lineStart);
    ta.value = newValue;
    this.valueChange.emit(newValue);

    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length);
    });
  }

  /** Insert raw text at cursor */
  insertText(content: string): void {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) return;
    this.pushHistoryImmediate(ta.value);

    const start = ta.selectionStart;
    const text = ta.value;
    const newValue = text.substring(0, start) + content + text.substring(start);

    ta.value = newValue;
    this.valueChange.emit(newValue);

    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + content.length, start + content.length);
    });
  }

  /** Insert a fenced code block */
  insertCodeBlock(): void {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) return;
    this.pushHistoryImmediate(ta.value);

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    const selected = text.substring(start, end);

    const block = '\n```\n' + (selected || 'code') + '\n```\n';
    const newValue = text.substring(0, start) + block + text.substring(end);

    ta.value = newValue;
    this.valueChange.emit(newValue);

    requestAnimationFrame(() => {
      ta.focus();
      const codeStart = start + 5; // after \n```\n
      ta.setSelectionRange(codeStart, codeStart + (selected ? selected.length : 4));
    });
  }

  /** Insert a markdown link */
  insertLink(): void {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) return;
    this.pushHistoryImmediate(ta.value);

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    const selected = text.substring(start, end);

    const link = `[${selected || 'link text'}](url)`;
    const newValue = text.substring(0, start) + link + text.substring(end);

    ta.value = newValue;
    this.valueChange.emit(newValue);

    requestAnimationFrame(() => {
      ta.focus();
      if (selected) {
        const urlStart = start + selected.length + 3;
        ta.setSelectionRange(urlStart, urlStart + 3);
      } else {
        ta.setSelectionRange(start + 1, start + 10);
      }
    });
  }

  /** Insert a markdown table */
  insertTable(): void {
    const table =
      '\n| Column 1 | Column 2 | Column 3 |\n| -------- | -------- | -------- |\n| Cell 1   | Cell 2   | Cell 3   |\n';
    this.insertText(table);
  }

  /** Insert a horizontal rule */
  insertHorizontalRule(): void {
    this.insertText('\n---\n');
  }

  /** Insert an Obsidian-style callout */
  insertCallout(): void {
    const ta = this.textareaRef()?.nativeElement;
    if (!ta) return;
    this.pushHistoryImmediate(ta.value);

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    const selected = text.substring(start, end);

    const callout = '\n> [!NOTE] ' + (selected || 'Title') + '\n> Content here\n';
    const newValue = text.substring(0, start) + callout + text.substring(end);

    ta.value = newValue;
    this.valueChange.emit(newValue);

    requestAnimationFrame(() => {
      ta.focus();
    });
  }
}

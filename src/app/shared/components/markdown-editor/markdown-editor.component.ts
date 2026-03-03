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
  templateUrl: './markdown-editor.component.html',
  styleUrls: ['./markdown-editor.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush, {
        margin-right: 8px;
        accent-color: rgb(6, 182, 212);
      }

      /* Obsidian highlight */
      :host ::ng-deep .md-live-preview mark,
      :host ::ng-deep .md-live-preview .md-highlight {
        background: rgba(250, 204, 21, 0.2);
        color: rgb(253, 224, 71);
        padding: 0 2px;
        border-radius: 2px;
      }

      /* Callouts */
      :host ::ng-deep .md-live-preview .md-callout {
        color: rgb(203, 213, 225);
      }
    `,
  ],
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

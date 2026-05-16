import {
  Component,
  input,
  output,
  signal,
  computed,
  ElementRef,
  viewChild,
  ChangeDetectionStrategy,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarkdownPipe } from '../../pipes/markdown.pipe';
import TurndownService from 'turndown';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

@Component({
  selector: 'app-markdown-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './markdown-editor.component.html',
  styleUrls: ['./markdown-editor.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkdownEditorComponent {
  /** Current markdown content */
  value = input<string>('');
  /** Textarea row count (Kept for compatibility, though WYSIWYG uses min-height) */
  rows = input<number>(6);
  /** Placeholder text */
  placeholder = input<string>('Write text...');
  /** Minimal mode — smaller padding, fewer buttons */
  minimal = input<boolean>(false);

  /** Emitted on every content change */
  valueChange = output<string>();
  /** Emitted when the textarea loses focus */
  blurred = output<void>();

  /** Reference to the contenteditable div */
  editorRef = viewChild<ElementRef<HTMLDivElement>>('editorRef');

  readonly codeBlockLabel = '{ }';
  hasContent = computed(() => (this.value() ?? '').trim().length > 0);

  // Undo/redo checking
  canUndo = signal(false);
  canRedo = signal(false);

  // Link Prompt State
  showLinkPrompt = signal(false);
  linkUrl = signal('');
  linkPromptPosition = signal<{ top: number; left: number }>({ top: 0, left: 0 });
  linkBtnRef = viewChild<ElementRef<HTMLButtonElement>>('linkBtnRef');
  private savedRange: Range | null = null;

  private turndownService: TurndownService;
  private isInternalUpdate = false;

  constructor() {
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
    });

    // Add gfm task list support for turndown
    this.turndownService.addRule('taskListItems', {
      filter: function (node: HTMLElement) {
        return (
          node.nodeName === 'INPUT' &&
          (node as HTMLInputElement).type === 'checkbox' &&
          node.parentNode?.nodeName === 'LI'
        );
      },
      replacement: function (content: string, node: HTMLElement) {
        return ((node as HTMLInputElement).checked ? '[x]' : '[ ]') + ' ' + content;
      },
    });

    effect(() => {
      const val = this.value() || '';
      const el = this.editorRef()?.nativeElement;
      if (el && !this.isInternalUpdate) {
        // External update (e.g., initial load)
        const currentMd = this.turndownService.turndown(el.innerHTML);
        if (currentMd !== val.trim() && currentMd !== val) {
          this.isInternalUpdate = true;
          const rawHtml = marked.parse(val, { breaks: true }) as string;
          el.innerHTML = DOMPurify.sanitize(rawHtml);
          this.isInternalUpdate = false;
        }
      }
    });
  }

  onInput(): void {
    const el = this.editorRef()?.nativeElement;
    if (!el) return;

    this.isInternalUpdate = true;
    const markdown = this.turndownService.turndown(el.innerHTML);
    this.valueChange.emit(markdown);

    this.canUndo.set(document.queryCommandEnabled('undo'));
    this.canRedo.set(document.queryCommandEnabled('redo'));

    // Yield to allow effect to ignore this update cycle
    setTimeout(() => {
      this.isInternalUpdate = false;
    }, 0);
  }

  undo(): void {
    document.execCommand('undo', false, '');
    this.onInput();
  }

  redo(): void {
    document.execCommand('redo', false, '');
    this.onInput();
  }

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
          this.execCmd('bold');
          break;
        case 'i':
          event.preventDefault();
          this.execCmd('italic');
          break;
        case 'k':
          event.preventDefault();
          this.insertLink();
          break;
        case 'e':
          event.preventDefault();
          this.execCmd('formatBlock', 'PRE');
          break;
      }
    }
    // Tab to indent
    if (event.key === 'Tab') {
      event.preventDefault();
      this.execCmd('insertHTML', '&nbsp;&nbsp;&nbsp;&nbsp;');
    }
  }

  private execCmd(command: string, value: string = ''): void {
    this.editorRef()?.nativeElement.focus();
    document.execCommand(command, false, value);
    this.onInput();
  }

  wrapSelection(markdownPrefix: string, markdownSuffix: string): void {
    // Map previous markdown wrappers to standard execCommand
    if (markdownPrefix === '**') this.execCmd('bold');
    else if (markdownPrefix === '*') this.execCmd('italic');
    else if (markdownPrefix === '~~') this.execCmd('strikeThrough');
    else if (markdownPrefix === '==')
      this.execCmd('hiliteColor', 'yellow'); // Highlight equivalent
    else if (markdownPrefix === '`') {
      const text = window.getSelection()?.toString() || 'code';
      this.execCmd('insertHTML', `<code>${text}</code>`);
    }
  }

  insertPrefix(prefix: string): void {
    if (prefix === '## ') this.execCmd('formatBlock', 'H2');
    else if (prefix === '> ') this.execCmd('formatBlock', 'BLOCKQUOTE');
    else if (prefix === '- ') this.execCmd('insertUnorderedList');
    else if (prefix === '1. ') this.execCmd('insertOrderedList');
    else if (prefix === '- [ ] ') {
      const text = window.getSelection()?.toString() || 'Task';
      this.execCmd(
        'insertHTML',
        `<ul><li class="md-task-item"><input type="checkbox"> ${text}</li></ul>`,
      );
    }
  }

  insertCodeBlock(): void {
    this.execCmd('formatBlock', 'PRE');
  }

  insertLink(): void {
    // Save selection range
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      this.savedRange = sel.getRangeAt(0);
    }
    this.linkUrl.set('');
    const btn = this.linkBtnRef()?.nativeElement;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      this.linkPromptPosition.set({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
    this.showLinkPrompt.set(true);
  }

  submitLink(event?: Event): void {
    if (event) event.preventDefault();
    if (this.savedRange) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(this.savedRange);
    }
    const url = this.linkUrl();
    if (url) {
      this.execCmd('createLink', url);
    }
    this.closeLinkPrompt();
  }

  closeLinkPrompt(): void {
    this.showLinkPrompt.set(false);
    this.linkUrl.set('');
    this.savedRange = null;
    this.editorRef()?.nativeElement.focus();
  }

  insertTable(): void {
    const tableHTML = `
      <table>
        <tr><th>Column 1</th><th>Column 2</th><th>Column 3</th></tr>
        <tr><td>Cell 1</td><td>Cell 2</td><td>Cell 3</td></tr>
      </table>
    `;
    this.execCmd('insertHTML', tableHTML);
  }

  insertHorizontalRule(): void {
    this.execCmd('insertHorizontalRule');
  }

  insertCallout(): void {
    const text = window.getSelection()?.toString() || 'Title';
    const calloutHTML = `
      <blockquote class="md-callout">
        [!NOTE] ${text}<br>
        Content here
      </blockquote>
    `;
    this.execCmd('insertHTML', calloutHTML);
  }
}

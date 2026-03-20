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

  // Use native undo/redo so cursor is preserved automatically.
  // We'll leave buttons visually enabled or hook into somewhat generic checks,
  // but to keep it simple, we just allow clicks to call execCommand.
  canUndo = signal(true);
  canRedo = signal(true);

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
      replacement: function (content, node: HTMLElement | any) {
        return ((node as HTMLInputElement).checked ? '[x]' : '[ ]') + ' ';
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
          el.innerHTML = marked.parse(val) as string;
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
    else if (markdownPrefix === '`') this.execCmd('fontName', 'monospace');
  }

  insertPrefix(prefix: string): void {
    if (prefix === '## ') this.execCmd('formatBlock', 'H2');
    else if (prefix === '> ') this.execCmd('formatBlock', 'BLOCKQUOTE');
    else if (prefix === '- ') this.execCmd('insertUnorderedList');
    else if (prefix === '1. ') this.execCmd('insertOrderedList');
    else if (prefix === '- [ ] ') {
      this.execCmd(
        'insertHTML',
        '<ul><li style="list-style-type: none;"><input type="checkbox"> Task</li></ul>',
      );
    }
  }

  insertCodeBlock(): void {
    this.execCmd('formatBlock', 'PRE');
  }

  insertLink(): void {
    const url = prompt('Enter link URL:');
    if (url) {
      this.execCmd('createLink', url);
    }
  }

  insertTable(): void {
    const tableHTML = `
      <table border="1">
        <tr><th>Column 1</th><th>Column 2</th><th>Column 3</th></tr>
        <tr><td>Cell 1</td><td>Cell 2</td><td>Cell 3</td></tr>
      </table><br>
    `;
    this.execCmd('insertHTML', tableHTML);
  }

  insertHorizontalRule(): void {
    this.execCmd('insertHorizontalRule');
  }

  insertCallout(): void {
    const calloutHTML = `
      <blockquote class="md-callout">
        <strong>[!NOTE] Title</strong><br>
        Content here
      </blockquote><br>
    `;
    this.execCmd('insertHTML', calloutHTML);
  }
}

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
  HostListener,
  inject,
  DestroyRef,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import TurndownService from 'turndown';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface FormattingState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  highlight: boolean;
  code: boolean;
  ul: boolean;
  ol: boolean;
  h2: boolean;
  blockquote: boolean;
  link: boolean;
}

const EMPTY_STATE: FormattingState = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  highlight: false,
  code: false,
  ul: false,
  ol: false,
  h2: false,
  blockquote: false,
  link: false,
};

const TEXT_COLORS = [
  '#e2e8f0', '#f8fafc', '#22d3ee', '#38bdf8', '#818cf8',
  '#c084fc', '#f472b6', '#fb7185', '#fb923c', '#facc15',
  '#a3e635', '#34d399', '#94a3b8', '#475569', '#0f172a',
];

// Traditional highlighter look — translucent so the underlying text colour
// stays readable through the fill. ``null`` means "clear highlight".
const HIGHLIGHT_COLORS: (string | null)[] = [
  null, // clear
  'rgba(250, 204, 21, 0.4)',  // yellow
  'rgba(251, 146, 60, 0.4)',  // orange
  'rgba(248, 113, 113, 0.4)', // red
  'rgba(244, 114, 182, 0.4)', // pink
  'rgba(192, 132, 252, 0.4)', // purple
  'rgba(129, 140, 248, 0.4)', // indigo
  'rgba(56, 189, 248, 0.4)',  // sky
  'rgba(34, 211, 238, 0.4)',  // cyan
  'rgba(52, 211, 153, 0.4)',  // green
  'rgba(163, 230, 53, 0.4)',  // lime
];

@Component({
  selector: 'app-markdown-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './markdown-editor.component.html',
  styleUrls: ['./markdown-editor.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkdownEditorComponent {
  private destroyRef = inject(DestroyRef);
  private zone = inject(NgZone);

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
  readonly textColors: readonly string[] = TEXT_COLORS;
  readonly highlightColors: readonly (string | null)[] = HIGHLIGHT_COLORS;
  hasContent = computed(() => (this.value() ?? '').trim().length > 0);

  // Undo/redo checking
  canUndo = signal(false);
  canRedo = signal(false);

  // Active formatting state — drives toolbar highlighting
  formatting = signal<FormattingState>(EMPTY_STATE);

  // Link Prompt State
  showLinkPrompt = signal(false);
  linkUrl = signal('');
  linkPromptPos = signal<{ top: number; left: number } | null>(null);
  private savedRange: Range | null = null;

  // Color pickers
  showColorPicker = signal(false);
  showHighlightPicker = signal(false);
  colorPickerPos = signal<{ top: number; left: number } | null>(null);
  highlightPickerPos = signal<{ top: number; left: number } | null>(null);

  private turndownService: TurndownService;
  private isInternalUpdate = false;
  private selectionHandler = () => this.updateFormattingState();

  constructor() {
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
    });

    // gfm task list support
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

    // Preserve <mark> highlights through the HTML→MD→HTML round trip
    this.turndownService.addRule('marks', {
      filter: 'mark',
      replacement: (content) => `==${content}==`,
    });

    // Preserve colored/highlighted spans so inline colors survive the round-trip.
    // We emit them as raw HTML inside markdown — marked() reparses them on the
    // way back out, and sanitize keeps the styles.
    this.turndownService.addRule('coloredSpans', {
      filter: (node) =>
        node.nodeName === 'SPAN' && !!(node as HTMLElement).getAttribute('style'),
      replacement: (content, node) => {
        const style = (node as HTMLElement).getAttribute('style') || '';
        return `<span style="${style}">${content}</span>`;
      },
    });

    effect(() => {
      const val = this.value() || '';
      const el = this.editorRef()?.nativeElement;
      if (el && !this.isInternalUpdate) {
        const currentMd = this.turndownService.turndown(el.innerHTML);
        if (currentMd !== val.trim() && currentMd !== val) {
          this.isInternalUpdate = true;
          el.innerHTML = this.mdToSafeHtml(val);
          this.isInternalUpdate = false;
          this.updateFormattingState();
        }
      }
    });

    // Watch selection changes globally so toolbar highlights track the caret.
    // Runs outside Angular to avoid zone thrashing; we signal() which triggers CD.
    this.zone.runOutsideAngular(() => {
      document.addEventListener('selectionchange', this.selectionHandler);
    });
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('selectionchange', this.selectionHandler);
    });
  }

  // ─── Rendering ────────────────────────────────────────────────────────────
  private mdToSafeHtml(md: string): string {
    const raw = marked.parse(md, { gfm: true, breaks: true }) as string;
    // Pre-process ==highlight== (Obsidian syntax) — the markdown-editor
    // version emits <mark> directly, but content loaded from elsewhere may
    // still contain the raw syntax.
    const processed = raw.replace(/==([^=]+?)==/g, '<mark>$1</mark>');
    return DOMPurify.sanitize(processed, {
      ADD_ATTR: ['target', 'rel', 'style'],
    });
  }

  // ─── Formatting state tracking ────────────────────────────────────────────
  private updateFormattingState(): void {
    const el = this.editorRef()?.nativeElement;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    // Only react when the selection is inside this editor
    const anchor = sel.anchorNode;
    if (!anchor || !el.contains(anchor)) return;

    const queryState = (cmd: string): boolean => {
      try {
        return document.queryCommandState(cmd);
      } catch {
        return false;
      }
    };

    // Walk up to the nearest block to detect blockquote / H2 / list / link
    let node: Node | null = anchor;
    let insideBlockquote = false;
    let insideH2 = false;
    let insideUL = false;
    let insideOL = false;
    let insideHighlight = false;
    let insideCode = false;
    let insideLink = false;
    while (node && node !== el) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const e = node as HTMLElement;
        const tag = e.tagName;
        if (tag === 'BLOCKQUOTE') insideBlockquote = true;
        if (tag === 'H2') insideH2 = true;
        if (tag === 'UL') insideUL = true;
        if (tag === 'OL') insideOL = true;
        // Highlight is any span with a non-transparent background-color, or a
        // legacy <mark> element from earlier editor versions.
        if (tag === 'MARK') insideHighlight = true;
        const bg = e.style?.backgroundColor;
        if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') insideHighlight = true;
        if (tag === 'CODE' || tag === 'PRE') insideCode = true;
        if (tag === 'A') insideLink = true;
      }
      node = node.parentNode;
    }

    const next: FormattingState = {
      bold: queryState('bold'),
      italic: queryState('italic'),
      underline: queryState('underline'),
      strike: queryState('strikeThrough'),
      highlight: insideHighlight,
      code: insideCode,
      ul: insideUL || queryState('insertUnorderedList'),
      ol: insideOL || queryState('insertOrderedList'),
      h2: insideH2,
      blockquote: insideBlockquote,
      link: insideLink,
    };

    // Shallow-compare; only signal if changed
    const prev = this.formatting();
    let changed = false;
    for (const k of Object.keys(next) as (keyof FormattingState)[]) {
      if (prev[k] !== next[k]) {
        changed = true;
        break;
      }
    }
    if (changed) {
      // Push back into Angular zone so signal change triggers OnPush CD
      this.zone.run(() => this.formatting.set(next));
    }
  }

  // ─── Core edit cycle ──────────────────────────────────────────────────────
  onInput(): void {
    const el = this.editorRef()?.nativeElement;
    if (!el) return;

    this.isInternalUpdate = true;
    const markdown = this.turndownService.turndown(el.innerHTML);
    this.valueChange.emit(markdown);

    this.canUndo.set(document.queryCommandEnabled('undo'));
    this.canRedo.set(document.queryCommandEnabled('redo'));

    // Yield so the external effect ignores this update cycle
    setTimeout(() => {
      this.isInternalUpdate = false;
    }, 0);
    this.updateFormattingState();
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
          if (event.shiftKey) this.redo();
          else this.undo();
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
        case 'u':
          event.preventDefault();
          this.execCmd('underline');
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
    if (event.key === 'Tab') {
      event.preventDefault();
      this.execCmd('insertHTML', '&nbsp;&nbsp;&nbsp;&nbsp;');
    }
  }

  /**
   * Handle clicks inside the editor. If the user clicks a hyperlink (either
   * with Cmd/Ctrl held OR any click on an anchor that isn't the caret-placing
   * intent), open it in a new tab. contenteditable normally swallows anchor
   * clicks entirely, so we must handle navigation ourselves.
   */
  onEditorClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement | null)?.closest('a');
    if (!target) return;
    const href = target.getAttribute('href');
    if (!href) return;
    // Cmd/Ctrl+click → open in new tab (standard browser contract).
    // Plain click on an <a> inside contenteditable also navigates — the user
    // wouldn't be able to otherwise. They can still edit the link text by
    // selecting it with keyboard/shift-click.
    event.preventDefault();
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  private execCmd(command: string, value: string = ''): void {
    this.editorRef()?.nativeElement.focus();
    document.execCommand(command, false, value);
    this.onInput();
  }

  // ─── Toolbar actions ──────────────────────────────────────────────────────
  toggleBold(): void { this.execCmd('bold'); }
  toggleItalic(): void { this.execCmd('italic'); }
  toggleUnderline(): void { this.execCmd('underline'); }
  toggleStrike(): void { this.execCmd('strikeThrough'); }

  private findAncestor(node: Node | null, tag: string): HTMLElement | null {
    while (node) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === tag) {
        return node as HTMLElement;
      }
      node = node.parentNode;
    }
    return null;
  }

  toggleHeading(): void { this.execCmd('formatBlock', 'H2'); }
  toggleBlockquote(): void { this.execCmd('formatBlock', 'BLOCKQUOTE'); }
  toggleUnorderedList(): void { this.execCmd('insertUnorderedList'); }
  toggleOrderedList(): void { this.execCmd('insertOrderedList'); }

  insertTaskList(): void {
    const text = window.getSelection()?.toString() || 'Task';
    this.execCmd(
      'insertHTML',
      `<ul><li class="md-task-item"><input type="checkbox"> ${text}</li></ul>`,
    );
  }

  toggleInlineCode(): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const codeAncestor = this.findAncestor(sel.anchorNode, 'CODE');
    if (codeAncestor) {
      const parent = codeAncestor.parentNode;
      if (parent) {
        while (codeAncestor.firstChild) parent.insertBefore(codeAncestor.firstChild, codeAncestor);
        parent.removeChild(codeAncestor);
      }
      this.onInput();
      return;
    }
    const text = sel.toString() || 'code';
    this.execCmd('insertHTML', `<code>${text}</code>`);
  }

  insertCodeBlock(): void { this.execCmd('formatBlock', 'PRE'); }

  // ─── Link prompt ─────────────────────────────────────────────────────────
  insertLink(triggerEl?: HTMLElement): void {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) this.savedRange = sel.getRangeAt(0);
    this.linkUrl.set('');
    if (triggerEl) this.linkPromptPos.set(this.anchorPosition(triggerEl, 280));
    this.showColorPicker.set(false);
    this.showHighlightPicker.set(false);
    this.showLinkPrompt.set(true);
  }

  submitLink(event?: Event): void {
    if (event) event.preventDefault();
    if (this.savedRange) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(this.savedRange);
    }
    const url = this.normalizeUrl(this.linkUrl());
    if (url) {
      // execCommand createLink doesn't add target/rel — patch them on after.
      this.execCmd('createLink', url);
      const el = this.editorRef()?.nativeElement;
      if (el) {
        for (const a of Array.from(el.querySelectorAll('a'))) {
          if (a.getAttribute('href') === url) {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
          }
        }
        this.onInput();
      }
    }
    this.closeLinkPrompt();
  }

  private normalizeUrl(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) return '';
    // If it's a bare domain with no scheme, prepend https://
    if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !trimmed.startsWith('//') && !trimmed.startsWith('#')) {
      return `https://${trimmed}`;
    }
    return trimmed;
  }

  closeLinkPrompt(): void {
    this.showLinkPrompt.set(false);
    this.linkUrl.set('');
    this.linkPromptPos.set(null);
    this.savedRange = null;
    this.editorRef()?.nativeElement.focus();
  }

  // ─── Colors & highlights ─────────────────────────────────────────────────
  openColorPicker(triggerEl: HTMLElement): void {
    // Save the selection so it's preserved while the picker is open
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) this.savedRange = sel.getRangeAt(0);
    this.colorPickerPos.set(this.anchorPosition(triggerEl, 220));
    this.showHighlightPicker.set(false);
    this.showLinkPrompt.set(false);
    this.showColorPicker.set(true);
  }

  openHighlightPicker(triggerEl: HTMLElement): void {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) this.savedRange = sel.getRangeAt(0);
    this.highlightPickerPos.set(this.anchorPosition(triggerEl, 220));
    this.showColorPicker.set(false);
    this.showLinkPrompt.set(false);
    this.showHighlightPicker.set(true);
  }

  applyColor(color: string): void {
    this.restoreSelection();
    // Use styleWithCSS so foreColor emits inline style instead of deprecated <font>
    try { document.execCommand('styleWithCSS', false, 'true'); } catch { /* noop */ }
    this.execCmd('foreColor', color);
    this.showColorPicker.set(false);
    this.colorPickerPos.set(null);
  }

  applyHighlight(color: string | null): void {
    this.restoreSelection();
    try { document.execCommand('styleWithCSS', false, 'true'); } catch { /* noop */ }
    if (color === null) {
      // Clear highlight — unwrap any <mark> ancestor on the selection and
      // remove background-color from enclosing spans. execCommand doesn't
      // have a dedicated "remove highlight", so we do it by hand.
      this.clearHighlightAtSelection();
    } else {
      this.execCmd('hiliteColor', color);
    }
    this.showHighlightPicker.set(false);
    this.highlightPickerPos.set(null);
  }

  private clearHighlightAtSelection(): void {
    const el = this.editorRef()?.nativeElement;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);

    // Walk the selection; for every enclosing MARK or SPAN w/ background-color,
    // null out the background. Simpler than trying to unwrap mid-selection.
    const markAncestor = this.findAncestor(range.startContainer, 'MARK');
    if (markAncestor) {
      const parent = markAncestor.parentNode;
      if (parent) {
        while (markAncestor.firstChild) parent.insertBefore(markAncestor.firstChild, markAncestor);
        parent.removeChild(markAncestor);
      }
    }

    // Clear background-color on every span under the selection
    const container: Node = range.commonAncestorContainer;
    const scope: HTMLElement =
      container.nodeType === Node.ELEMENT_NODE
        ? (container as HTMLElement)
        : (container.parentElement ?? el);
    const spans = scope.querySelectorAll<HTMLElement>('span[style*="background"]');
    spans.forEach((s) => {
      if (range.intersectsNode(s) && s.style.backgroundColor) {
        s.style.backgroundColor = '';
        if (!s.getAttribute('style')?.trim()) s.removeAttribute('style');
      }
    });
    // Also check the ancestor chain directly in case the caret is inside a
    // span that's not a descendant of commonAncestorContainer.
    let walk: HTMLElement | null = scope;
    while (walk && walk !== el) {
      if (walk.tagName === 'SPAN' && walk.style.backgroundColor) {
        walk.style.backgroundColor = '';
        if (!walk.getAttribute('style')?.trim()) walk.removeAttribute('style');
      }
      walk = walk.parentElement;
    }

    this.onInput();
  }

  private restoreSelection(): void {
    if (!this.savedRange) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(this.savedRange);
  }

  // ─── Inserts ─────────────────────────────────────────────────────────────
  insertTable(): void {
    const tableHTML = `
      <table>
        <tr><th>Column 1</th><th>Column 2</th><th>Column 3</th></tr>
        <tr><td>Cell 1</td><td>Cell 2</td><td>Cell 3</td></tr>
      </table>
    `;
    this.execCmd('insertHTML', tableHTML);
  }

  insertHorizontalRule(): void { this.execCmd('insertHorizontalRule'); }

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

  // ─── Popup positioning ────────────────────────────────────────────────────
  /**
   * Compute a viewport-fixed position for a popup anchored under the trigger
   * button. Clamps to the viewport so the popup never gets cut off when the
   * trigger is near the right edge or bottom of the screen.
   */
  private anchorPosition(triggerEl: HTMLElement, popupWidth: number): { top: number; left: number } {
    const rect = triggerEl.getBoundingClientRect();
    const margin = 8;
    let left = rect.left;
    const maxLeft = window.innerWidth - popupWidth - margin;
    if (left > maxLeft) left = Math.max(margin, maxLeft);
    let top = rect.bottom + 4;
    // If there isn't room below, pop it above instead
    if (top + 80 > window.innerHeight) {
      top = Math.max(margin, rect.top - 60);
    }
    return { top, left };
  }

  // Close popups on outside click / escape
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showLinkPrompt()) this.closeLinkPrompt();
    if (this.showColorPicker()) { this.showColorPicker.set(false); this.colorPickerPos.set(null); }
    if (this.showHighlightPicker()) { this.showHighlightPicker.set(false); this.highlightPickerPos.set(null); }
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMousedown(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    // If click landed inside any popup or toolbar button, ignore
    if (target.closest('.md-popup') || target.closest('.md-btn')) return;
    if (this.showLinkPrompt()) this.closeLinkPrompt();
    if (this.showColorPicker()) { this.showColorPicker.set(false); this.colorPickerPos.set(null); }
    if (this.showHighlightPicker()) { this.showHighlightPicker.set(false); this.highlightPickerPos.set(null); }
  }
}

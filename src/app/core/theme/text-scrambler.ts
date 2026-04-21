/**
 * OmniFlex Text Scrambler — glitch-heavy character decode on hover.
 *
 * Vanilla TypeScript port of the demo script. No external deps.
 *
 * Usage: add `data-scramble` to any text element; call `bindScramble(el)`
 * once per element (guarded by a `data-scramble-bound` sentinel). The
 * element's `innerText` is captured fresh on each mouseenter, so edits
 * to task titles are picked up automatically on the next hover.
 */

const GLITCH_CHARS = '▓▒░█▄▀■□◆◇▲▼►◄!@#$%^&*()_+={}[]|\\:;"<>?,./`~';
const GLITCH_COLORS = ['#00d9ff', '#ff006e', '#b026ff', '#00fff5'];

interface QueueEntry {
  from: string;
  to: string;
  start: number;
  end: number;
  char?: string;
}

export class TextScrambler {
  private readonly el: HTMLElement;
  private queue: QueueEntry[] = [];
  private frame = 0;
  private frameRequest: number | null = null;
  private resolve: (() => void) | null = null;

  constructor(element: HTMLElement) {
    this.el = element;
  }

  setText(newText: string): Promise<void> {
    const oldText = this.el.innerText;
    const length = Math.max(oldText.length, newText.length);
    const promise = new Promise<void>((resolve) => {
      this.resolve = resolve;
    });
    this.queue = [];

    for (let i = 0; i < length; i++) {
      const from = oldText[i] || '';
      const to = newText[i] || '';
      // Frame budgets tuned for ~200-350ms total on a 60fps display.
      const start = Math.floor(Math.random() * 8);
      const end = start + Math.floor(Math.random() * 8) + 4;
      this.queue.push({ from, to, start, end });
    }

    if (this.frameRequest !== null) {
      cancelAnimationFrame(this.frameRequest);
    }
    this.frame = 0;
    this.update();
    return promise;
  }

  private update(): void {
    let output = '';
    let complete = 0;

    for (let i = 0, n = this.queue.length; i < n; i++) {
      const entry = this.queue[i];
      const { from, to, start, end } = entry;
      let { char } = entry;

      if (this.frame >= end) {
        complete++;
        output += to;
      } else if (this.frame >= start) {
        if (!char || Math.random() < 0.28) {
          char = this.randomChar();
          entry.char = char;
        }
        output += `<span style="color: ${this.randomColor()}">${char}</span>`;
      } else {
        output += from;
      }
    }

    this.el.innerHTML = output;

    if (complete === this.queue.length) {
      this.resolve?.();
      this.frameRequest = null;
    } else {
      this.frameRequest = requestAnimationFrame(() => this.update());
      this.frame++;
    }
  }

  private randomChar(): string {
    return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
  }

  private randomColor(): string {
    return GLITCH_COLORS[Math.floor(Math.random() * GLITCH_COLORS.length)];
  }
}

/**
 * Wire a single element for scramble-on-hover. Idempotent — the
 * `data-scramble-bound` sentinel prevents double-binding when the
 * MutationObserver re-scans.
 */
export function bindScramble(el: HTMLElement): void {
  if (el.dataset['scrambleBound'] === 'true') return;
  el.dataset['scrambleBound'] = 'true';

  const scrambler = new TextScrambler(el);
  let isScrambling = false;

  el.addEventListener('mouseenter', () => {
    if (isScrambling) return;
    isScrambling = true;

    // Fresh read: picks up edited task titles without extra plumbing.
    const finalText = el.innerText;

    // Width stabilization: capture the current bounding box so glyph
    // changes during the scramble (wide block-drawing chars ↔ narrow
    // ASCII) don't stretch the element or push siblings around. We keep
    // the element's own font — that stops the visible "size change" the
    // old monospace swap caused.
    const rect = el.getBoundingClientRect();
    const originalMinWidth = el.style.minWidth;
    const originalDisplay = el.style.display;
    const computedDisplay = window.getComputedStyle(el).display;
    if (computedDisplay === 'inline') {
      el.style.display = 'inline-block';
    }
    el.style.minWidth = `${Math.ceil(rect.width)}px`;
    el.classList.add('is-scrambling');

    scrambler
      .setText(finalText)
      .then(() => {
        el.innerText = finalText;
      })
      .finally(() => {
        el.classList.remove('is-scrambling');
        el.style.minWidth = originalMinWidth;
        el.style.display = originalDisplay;
        isScrambling = false;
      });
  });
}

/**
 * OmniFlex Text Scrambler — glitch-heavy character decode on hover.
 *
 * Vanilla TypeScript port of the demo script. No external deps.
 *
 * Usage: add `data-scramble` to any text element; call `bindScramble(el)`
 * once per element (guarded by a `data-scramble-bound` sentinel). The
 * element's original text is preserved across scrambles — the animation
 * plays inside a sibling `<span class="scramble-overlay">` that sits on
 * top of the original content, so Angular-managed text nodes keep their
 * framework bindings and still update when inputs change after a hover.
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
 * Read the element's text while ignoring the dedicated scramble overlay.
 * This matters for elements where Angular's text interpolation is the
 * "real" content: we must not include the overlay's own characters when
 * capturing the target text for the next scramble pass.
 */
function textExcludingOverlay(el: HTMLElement, overlay: HTMLElement): string {
  let text = '';
  el.childNodes.forEach((node) => {
    if (node === overlay) return;
    text += node.textContent ?? '';
  });
  return text;
}

/**
 * Wire a single element for scramble-on-hover. Idempotent — the
 * `data-scramble-bound` sentinel prevents double-binding when the
 * MutationObserver re-scans. The scramble only fires once per page
 * load per element: on the first hover, the mouseenter listener
 * unbinds itself so the decode does not repeat.
 */
export function bindScramble(el: HTMLElement): void {
  if (el.dataset['scrambleBound'] === 'true') return;
  el.dataset['scrambleBound'] = 'true';

  // The overlay is what the scrambler mutates. Keeping our DOM writes
  // inside a child element preserves the Angular-managed text node (or
  // any other framework-managed content) inside `el` so bindings still
  // update after the animation finishes.
  const overlay = document.createElement('span');
  overlay.className = 'scramble-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  el.appendChild(overlay);

  const scrambler = new TextScrambler(overlay);

  const onEnter = (): void => {
    el.removeEventListener('mouseenter', onEnter);

    // Fresh read: picks up edited text without extra plumbing, and
    // deliberately excludes the (empty) overlay.
    const finalText = textExcludingOverlay(el, overlay);

    // Width stabilization: capture the current bounding box so glyph
    // changes during the scramble (wide block-drawing chars ↔ narrow
    // ASCII) don't stretch the element or push siblings around. We keep
    // the element's own font — that stops the visible "size change" the
    // old monospace swap caused.
    const rect = el.getBoundingClientRect();
    const originalMinWidth = el.style.minWidth;
    const originalDisplay = el.style.display;
    const computed = window.getComputedStyle(el);
    if (computed.display === 'inline') {
      el.style.display = 'inline-block';
    }
    el.style.minWidth = `${Math.ceil(rect.width)}px`;

    // Copy the element's resolved text styles onto the overlay before the
    // parent's text is hidden via `.is-scrambling`. Without this, non-
    // scrambled glyphs would inherit `color: transparent` from the parent
    // and disappear mid-animation.
    overlay.style.color = computed.color;
    overlay.style.textShadow = computed.textShadow;

    // Seed the overlay with the current text so the scrambler reads it as
    // the "from" state. Without this, the queue's from-chars default to
    // an empty string and glyphs pop in from nothing during the pre-start
    // frames instead of flickering in place.
    overlay.textContent = finalText;

    el.classList.add('is-scrambling');

    scrambler
      .setText(finalText)
      .finally(() => {
        // Clear the overlay so the underlying Angular/static text shows
        // through cleanly again, and let the CSS hook (`.is-scrambling`)
        // restore the element to its normal state.
        overlay.textContent = '';
        overlay.style.color = '';
        overlay.style.textShadow = '';
        el.classList.remove('is-scrambling');
        el.style.minWidth = originalMinWidth;
        el.style.display = originalDisplay;
      });
  };

  el.addEventListener('mouseenter', onEnter);
}

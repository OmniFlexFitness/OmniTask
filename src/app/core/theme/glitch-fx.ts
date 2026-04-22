/**
 * Orchestrator for the two interaction effects used across OmniTask:
 *
 *   - PowerGlitch on elements tagged with `.omni-glitch-btn`
 *     (primary action buttons)
 *   - Character-decode scramble on elements tagged with `[data-scramble]`
 *     (headings + task titles)
 *
 * Angular re-renders lists constantly, so we can't bind once in a
 * component's init hook and forget it. Instead, a single MutationObserver
 * at the App root watches for new matching nodes and binds them.
 * Idempotency is enforced by per-element sentinel attributes:
 * `data-glitch-bound` and `data-scramble-bound`.
 *
 * Skipped entirely when `prefers-reduced-motion: reduce` is set — the
 * underlying elements still function; they just get no animation.
 */

import { PowerGlitch } from 'powerglitch';
import { bindScramble } from './text-scrambler';

// `shake: false` disables the whole-element translate animation that
// read as an "earthquake" on hover. The slice (chromatic-aberration
// band displacement) is what actually sells the glitch look, so we
// keep that. `iterations: 1` + `playMode: 'hover'` means one run per
// mouseenter — it does not loop while the cursor sits on the element.
const POWERGLITCH_CONFIG = {
  playMode: 'hover' as const,
  createContainers: true,
  hideOverflow: false,
  timing: {
    duration: 400,
    iterations: 1,
  },
  glitchTimeSpan: {
    start: 0,
    end: 0.6,
  },
  shake: false as const,
  slice: {
    count: 3,
    velocity: 18,
    minHeight: 0.05,
    maxHeight: 0.15,
    hueRotate: false,
  },
};

let observer: MutationObserver | null = null;
let scanScheduled = false;

function scheduleScan(): void {
  if (scanScheduled) return;
  scanScheduled = true;
  requestAnimationFrame(() => {
    scanScheduled = false;
    scan();
  });
}

function scan(): void {
  // Scramble targets — cheap to bind one at a time.
  const scrambleTargets = document.querySelectorAll<HTMLElement>(
    '[data-scramble]:not([data-scramble-bound])',
  );
  scrambleTargets.forEach((el) => bindScramble(el));

  // PowerGlitch targets — batch-call with the unbound element array so
  // the library only iterates the new nodes. Each bound element is
  // marked so subsequent scans skip it.
  const glitchTargets = Array.from(
    document.querySelectorAll<HTMLElement>('.omni-glitch-btn:not([data-glitch-bound])'),
  );
  if (glitchTargets.length > 0) {
    glitchTargets.forEach((el) => {
      el.dataset['glitchBound'] = 'true';
    });
    try {
      PowerGlitch.glitch(glitchTargets, POWERGLITCH_CONFIG);
    } catch (err) {
      console.error('PowerGlitch bind failed:', err);
      // Roll back sentinels so a later retry can bind them.
      glitchTargets.forEach((el) => {
        delete el.dataset['glitchBound'];
      });
    }
  }
}

/**
 * Start the observer. Safe to call multiple times; subsequent calls are
 * no-ops. Does nothing if the user has requested reduced motion.
 */
export function initGlitchFx(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (observer) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  // Initial pass for anything already in the DOM.
  scan();

  observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        scheduleScan();
        return;
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Tear the observer down. Leaves bound elements as-is — PowerGlitch
 * listeners stay attached to existing buttons until their DOM nodes
 * are removed (which is what happens on app destroy anyway).
 */
export function destroyGlitchFx(): void {
  observer?.disconnect();
  observer = null;
}

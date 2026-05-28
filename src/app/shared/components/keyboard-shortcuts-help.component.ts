import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KeyboardShortcutsService } from '../../core/services/keyboard-shortcuts.service';

@Component({
  selector: 'app-keyboard-shortcuts-help',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shortcuts.helpOpen()) {
      <div class="fixed inset-0 z-[10000] flex items-center justify-center p-4">
        <button
          type="button"
          class="absolute inset-0 bg-black/70"
          aria-label="Close shortcuts help"
          (click)="close()"
        ></button>

        <div
          class="relative w-full max-w-lg rounded-2xl border border-cyan-500/15 bg-[#0a0f1e]/95 shadow-[0_0_30px_rgba(0,210,255,0.12)] p-5"
          role="dialog"
          aria-modal="true"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold text-white font-['Orbitron',sans-serif]">
                Keyboard shortcuts
              </h2>
              <p class="mt-1 text-xs text-slate-400">Shortcuts are disabled while typing in inputs.</p>
            </div>
            <button
              type="button"
              class="omni-glitch-btn p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/5"
              aria-label="Close"
              (click)="close()"
            >
              ✕
            </button>
          </div>

          <div class="mt-4 space-y-2 text-sm">
            <div class="flex justify-between gap-4 py-1 border-b border-white/5">
              <span class="text-slate-200">Open search</span>
              <kbd class="text-xs text-cyan-200">Ctrl+K</kbd>
            </div>
            <div class="flex justify-between gap-4 py-1 border-b border-white/5">
              <span class="text-slate-200">Close menus / drawer</span>
              <kbd class="text-xs text-cyan-200">Esc</kbd>
            </div>
            <div class="flex justify-between gap-4 py-1">
              <span class="text-slate-200">Show this help</span>
              <kbd class="text-xs text-cyan-200">?</kbd>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class KeyboardShortcutsHelpComponent {
  readonly shortcuts = inject(KeyboardShortcutsService);

  close(): void {
    this.shortcuts.helpOpen.set(false);
  }
}

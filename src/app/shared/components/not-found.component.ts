import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-[70vh] flex items-center justify-center p-6">
      <div
        class="w-full max-w-lg rounded-2xl border border-cyan-500/10 bg-[#0a0f1e]/70 shadow-[0_0_30px_rgba(0,210,255,0.08)] p-6"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-[10px] uppercase tracking-[0.25em] text-cyan-400/80 font-semibold">
              OmniTask
            </p>
            <h1 class="mt-2 text-2xl font-bold text-white font-['Orbitron',sans-serif]">
              Page not found
            </h1>
            <p class="mt-2 text-sm text-white/60">
              That URL doesn’t exist. If you followed a link, it may be outdated.
            </p>
          </div>
          <div
            class="shrink-0 h-12 w-12 rounded-xl border border-violet-500/25 bg-violet-500/10 flex items-center justify-center text-violet-200"
            aria-hidden="true"
          >
            <span class="text-lg font-bold">404</span>
          </div>
        </div>

        <div class="mt-6 flex flex-wrap gap-2">
          <a
            routerLink="/"
            class="omni-glitch-btn px-3 py-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 text-xs font-semibold hover:bg-cyan-500/20 transition-all"
          >
            Go to Dashboard
          </a>
          <button
            type="button"
            class="omni-glitch-btn px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-slate-200 text-xs font-semibold hover:bg-white/10 transition-all"
            (click)="goBack()"
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  `,
})
export class NotFoundComponent {
  private readonly location = inject(Location);

  goBack(): void {
    this.location.back();
  }
}


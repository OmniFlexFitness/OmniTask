import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-oauth-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-[60vh] flex items-center justify-center p-6">
      <div class="max-w-md w-full rounded-xl border border-cyan-500/10 bg-[#0a0f1e]/70 p-6">
        <h1 class="text-lg font-bold text-white font-['Orbitron',sans-serif]">Connecting…</h1>
        <p class="mt-2 text-sm text-white/60">
          Finishing Google authorization. You can close this tab if it doesn't redirect.
        </p>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OAuthCallbackComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    // Placeholder: AuthService currently uses Firebase popup flow, not a real OAuth redirect exchange.
    // We still define the route so the configured redirect URI exists and doesn't 404.
    void this.router.navigate(['/settings']);
  }
}


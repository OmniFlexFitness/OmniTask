import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-oauth-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-[60vh] flex items-center justify-center p-6">
      <div class="max-w-md w-full rounded-xl border border-cyan-500/10 bg-[#0a0f1e]/70 p-6">
        <h1 class="text-lg font-bold text-white font-['Orbitron',sans-serif]">
          {{ error() ? 'Authorization failed' : 'Connecting…' }}
        </h1>
        <p class="mt-2 text-sm text-white/60">
          @if (error()) {
            {{ error() }}
          } @else {
            Finishing Google authorization. You will be redirected shortly.
          }
        </p>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OAuthCallbackComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  error = signal<string | null>(null);

  constructor() {
    void this.handleCallback();
  }

  private async handleCallback(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const oauthError = params.get('error');
    if (oauthError) {
      this.error.set(`Google returned: ${oauthError}`);
      return;
    }

    const code = params.get('code');
    const state = params.get('state');
    if (!code) {
      this.error.set('Missing authorization code.');
      return;
    }

    try {
      await this.auth.completeOAuthCallback(code, state);
      const returnUrl = this.auth.consumeOAuthReturnUrl();
      await this.router.navigateByUrl(returnUrl);
    } catch (err) {
      console.error('OAuth callback failed:', err);
      this.error.set(err instanceof Error ? err.message : 'Authorization failed.');
    }
  }
}

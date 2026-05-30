import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { GithubService } from '../../core/services/github.service';

/**
 * Settings panel for the GitHub connection: connect/disconnect and capability
 * status. All GitHub access is server-side; this only drives the callables.
 */
@Component({
  selector: 'app-github-connection',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="bg-slate-900/50 border border-white/10 rounded-2xl p-6 mb-6">
      <h2 class="text-lg font-semibold text-white mb-2 flex items-center gap-2">
        <svg class="h-5 w-5 text-purple-400" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path
            d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
          />
        </svg>
        GitHub Issues
      </h2>
      <p class="text-slate-400 text-sm mb-6">
        Link OmniTask tasks to GitHub issues. Linked tasks auto-create an issue and keep
        open/closed status in sync. Unlinked tasks are unaffected.
      </p>

      @if (loading()) {
        <p class="text-slate-400 text-sm">Checking connection…</p>
      } @else if (status()?.connected) {
        <div class="flex flex-wrap items-center gap-3">
          <span class="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 text-sm">
            Connected as {{ status()?.accountLogin }}
          </span>
          @if (status()?.capabilities?.issueTypes) {
            <span class="text-xs text-slate-400">Issue Types available</span>
          } @else {
            <span class="text-xs text-slate-500">Issue Types unavailable on this account</span>
          }
          <button
            type="button"
            class="ml-auto rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/80 hover:bg-white/5 disabled:opacity-50"
            [disabled]="busy()"
            (click)="disconnect()"
          >
            {{ busy() ? 'Disconnecting…' : 'Disconnect' }}
          </button>
        </div>
      } @else if (status()?.state === 'needs_reauth') {
        <div class="flex flex-wrap items-center gap-3">
          <span class="inline-flex items-center gap-2 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1 text-sm">
            Reconnect needed
          </span>
          <button
            type="button"
            class="rounded-lg bg-purple-600 hover:bg-purple-500 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            [disabled]="busy()"
            (click)="connect()"
          >
            Reconnect GitHub
          </button>
        </div>
      } @else {
        <button
          type="button"
          class="rounded-lg bg-purple-600 hover:bg-purple-500 px-4 py-2 text-sm text-white disabled:opacity-50"
          [disabled]="busy()"
          (click)="connect()"
        >
          {{ busy() ? 'Redirecting…' : 'Connect GitHub' }}
        </button>
      }

      @if (error()) {
        <p class="mt-3 text-sm text-rose-400">{{ error() }}</p>
      }
    </section>
  `,
})
export class GithubConnectionComponent implements OnInit {
  private readonly github = inject(GithubService);

  readonly status = this.github.connection;
  readonly loading = this.github.loading;
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      await this.github.loadConnection();
    } catch (err) {
      this.error.set(this.message(err, 'Could not load GitHub connection.'));
    }
  }

  async connect(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.github.startConnect('/settings');
      // startConnect redirects away; nothing runs after on success.
    } catch (err) {
      this.error.set(this.message(err, 'Could not start GitHub connection.'));
      this.busy.set(false);
    }
  }

  async disconnect(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.github.disconnect();
    } catch (err) {
      this.error.set(this.message(err, 'Could not disconnect.'));
    } finally {
      this.busy.set(false);
    }
  }

  private message(err: unknown, fallback: string): string {
    return err instanceof Error ? err.message : fallback;
  }
}

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <nav class="sticky top-0 z-50 backdrop-blur-xl bg-slate-900/70 border-b border-cyan-500/20 shadow-lg shadow-purple-500/10">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center gap-6">
            <div class="flex items-center gap-3">
              <div class="relative">
                <span class="absolute -inset-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 blur opacity-60"></span>
                <span class="relative flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 border border-white/10 text-lg font-black tracking-tight">OF</span>
              </div>
              <div class="leading-tight">
                <p class="text-[10px] uppercase tracking-[0.35em] text-cyan-200/70">OmniFlex</p>
                <p class="text-xl font-bold text-white">OmniTask</p>
              </div>
            </div>

            <div class="hidden md:block">
              <div class="ml-4 flex items-baseline space-x-2">
                <a
                  routerLink="/"
                  class="px-3 py-2 rounded-lg text-sm font-semibold text-slate-100 border border-transparent hover:border-cyan-400/40 hover:bg-white/5 transition"
                >Dashboard</a>
                <a
                  routerLink="/projects"
                  class="px-3 py-2 rounded-lg text-sm font-semibold text-slate-200/80 hover:text-white border border-transparent hover:border-cyan-400/40 hover:bg-white/5 transition"
                >Projects</a>
                <a
                  routerLink="/tasks"
                  class="px-3 py-2 rounded-lg text-sm font-semibold text-slate-200/80 hover:text-white border border-transparent hover:border-cyan-400/40 hover:bg-white/5 transition"
                >My Tasks</a>
              </div>
            </div>
          </div>

          <div class="hidden md:block">
            <div class="flex items-center gap-4">
              <div class="text-sm text-slate-200/80">
                <p class="font-semibold">{{ auth.currentUserSig()?.email }}</p>
                <p class="text-[10px] uppercase tracking-[0.25em] text-cyan-200/70">Authorized</p>
              </div>
              <button
                (click)="auth.logout()"
                class="ofx-gradient-button px-4 py-2 text-sm"
              >
                <span class="relative z-10">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  `
})
export class NavbarComponent {
  auth = inject(AuthService);
}

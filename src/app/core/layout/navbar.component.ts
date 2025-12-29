import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <nav class="sticky top-0 z-20 bg-omni-ink/80 backdrop-blur-xl border-b border-white/10">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <div class="flex items-center gap-4">
            <div class="relative">
              <div class="absolute -inset-1 bg-gradient-to-r from-omni-fuchsia to-omni-glow rounded-xl blur opacity-60"></div>
              <div class="relative flex h-11 w-11 items-center justify-center rounded-xl bg-omni-ink border border-white/10 shadow-neon text-lg font-black tracking-tight">
                OF
              </div>
            </div>
            <div class="leading-tight">
              <p class="text-[10px] uppercase tracking-[0.35em] text-sky-200">OmniFlex System</p>
              <p class="text-lg font-semibold text-white">OmniTask Control</p>
            </div>
          </div>

          <div class="hidden md:flex items-center gap-8 text-sm font-medium">
            <a routerLink="/" class="text-slate-200 hover:text-white transition-colors">Dashboard</a>
            <a routerLink="/projects" class="text-slate-400 hover:text-white transition-colors">Projects</a>
            <a routerLink="/tasks" class="text-slate-400 hover:text-white transition-colors">My Tasks</a>
          </div>

          <div class="hidden md:flex items-center gap-4">
            <div class="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-sky-100">
              {{ auth.currentUserSig()?.email }}
            </div>
            <button
              (click)="auth.logout()"
              class="btn-gradient px-4 py-2 text-sm"
            >
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  `
})
export class NavbarComponent {
  auth = inject(AuthService);
}

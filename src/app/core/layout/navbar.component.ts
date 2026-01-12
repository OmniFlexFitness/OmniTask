import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <!-- Top neon accent bar - solid color with glow -->
    <div class="h-[3px] w-full relative overflow-hidden">
      <div class="absolute inset-0 bg-cyan-500"></div>
      <div
        class="absolute inset-0 shadow-[0_0_20px_rgba(0,210,255,0.8),0_0_40px_rgba(0,210,255,0.4)]"
      ></div>
    </div>

    <nav class="sticky top-0 z-50 relative overflow-hidden">
      <!-- Dark base with enhanced transparency -->
      <div class="absolute inset-0 bg-[#050810]/95 backdrop-blur-xl"></div>

      <!-- Animated grid overlay for cyber effect -->
      <div class="absolute inset-0 opacity-[0.05] pointer-events-none cyber-grid-bg-dense"></div>

      <!-- Simple solid side accents -->
      <div class="absolute left-0 top-0 w-[2px] h-full bg-cyan-500/30"></div>
      <div class="absolute right-0 top-0 w-[2px] h-full bg-fuchsia-500/30"></div>

      <!-- Bottom neon border - solid color -->
      <div
        class="absolute bottom-0 left-0 right-0 h-px bg-cyan-500/50 shadow-[0_0_12px_rgba(0,210,255,0.5)]"
      ></div>

      <!-- Content -->
      <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <!-- Left: Logo + Nav -->
          <div class="flex items-center gap-10">
            <div class="flex items-center gap-3 group cursor-pointer">
              <!-- Logo with enhanced neon ring - KEEPING GRADIENT HERE (logo element) -->
              <div class="relative">
                <span
                  class="absolute -inset-2 rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 blur-md opacity-50 group-hover:opacity-80 transition-opacity animate-pulse"
                ></span>
                <span class="absolute -inset-1 rounded-full bg-[#251247] opacity-80"></span>
                <img
                  src="assets/images/logo.png"
                  alt="OmniFlex"
                  class="relative h-10 w-10 rounded-full object-contain ring-2 ring-cyan-500/40 shadow-[0_0_15px_rgba(0,210,255,0.4)]"
                />
              </div>
              <div class="flex flex-col">
                <span class="text-[9px] uppercase tracking-[0.25em] text-cyan-400/80 font-semibold"
                  >OmniFlex</span
                >
                <span
                  class="text-xl font-bold text-white tracking-tight drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]"
                  style="font-family: 'Orbitron', sans-serif;"
                  >OmniTask</span
                >
              </div>
            </div>

            <!-- Nav links with solid hover effects -->
            <div class="hidden md:flex items-center gap-1">
              <a
                routerLink="/"
                class="relative px-4 py-2 text-sm font-semibold text-cyan-400 hover:text-white transition-all group"
              >
                <span class="absolute inset-0 rounded-lg bg-cyan-500/10 opacity-50"></span>
                <span
                  class="absolute bottom-0 left-1/2 -translate-x-1/2 w-2/3 h-0.5 bg-cyan-500 rounded-full shadow-[0_0_10px_rgba(0,210,255,0.9)]"
                ></span>
                <span class="relative">Dashboard</span>
              </a>
              <a
                routerLink="/projects"
                class="relative px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-all group"
              >
                <span
                  class="absolute inset-0 rounded-lg bg-fuchsia-500/0 group-hover:bg-fuchsia-500/10 transition-all"
                ></span>
                <span
                  class="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-fuchsia-500 group-hover:w-2/3 transition-all rounded-full shadow-[0_0_8px_rgba(224,64,251,0.8)]"
                ></span>
                <span class="relative">Projects</span>
              </a>
              <a
                routerLink="/tasks"
                class="relative px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-all group"
              >
                <span
                  class="absolute inset-0 rounded-lg bg-fuchsia-500/0 group-hover:bg-fuchsia-500/10 transition-all"
                ></span>
                <span
                  class="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-fuchsia-500 group-hover:w-2/3 transition-all rounded-full shadow-[0_0_8px_rgba(224,64,251,0.8)]"
                ></span>
                <span class="relative">My Tasks</span>
              </a>
            </div>
          </div>

          <!-- Right: User + Logout -->
          <div class="hidden md:flex items-center gap-5">
            <!-- User email with status indicator -->
            <div class="flex items-center gap-2.5">
              <span
                class="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pulse"
              ></span>
              <span class="text-sm text-slate-400 font-medium">{{
                auth.currentUserSig()?.email
              }}</span>
            </div>

            <!-- Cyberpunk logout button - solid border with glow -->
            <button
              (click)="auth.logout()"
              class="relative px-5 py-2 text-sm font-bold uppercase tracking-wider rounded-lg overflow-hidden group transition-all duration-300 hover:scale-105"
            >
              <!-- Solid border -->
              <span
                class="absolute inset-0 rounded-lg border-2 border-fuchsia-500 opacity-80"
              ></span>
              <!-- Inner fill -->
              <span
                class="absolute inset-0 rounded-lg bg-[#0a0f1e] group-hover:bg-fuchsia-500/10 transition-colors"
              ></span>
              <!-- Glow on hover -->
              <span
                class="absolute -inset-1 opacity-0 group-hover:opacity-50 transition-opacity blur-lg bg-fuchsia-500/50"
              ></span>
              <!-- Text -->
              <span class="relative text-fuchsia-400 group-hover:text-white transition-colors"
                >Logout</span
              >
            </button>
          </div>
        </div>
      </div>
    </nav>
  `,
  styles: [
    `
      @keyframes shimmer {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(100%);
        }
      }
      .animate-shimmer {
        animation: shimmer 3s ease-in-out infinite;
      }
    `,
  ],
})
export class NavbarComponent {
  auth = inject(AuthService);
}

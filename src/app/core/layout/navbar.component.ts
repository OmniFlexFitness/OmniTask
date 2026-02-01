import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
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
        <div class="flex items-center justify-between h-14">
          <!-- Left: Logo + Nav -->
          <div class="flex items-center gap-6">
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
                  class="relative h-8 w-8 rounded-full object-contain ring-2 ring-cyan-500/40 shadow-[0_0_15px_rgba(0,210,255,0.4)]"
                />
              </div>
              <div class="flex flex-col">
                <span class="text-[8px] uppercase tracking-[0.25em] text-cyan-400/80 font-semibold"
                  >OmniFlex</span
                >
                <span
                  class="text-lg font-bold text-white tracking-tight drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]"
                  style="font-family: 'Orbitron', sans-serif;"
                  >OmniTask</span
                >
              </div>
            </div>

            <!-- Nav links with solid hover effects -->
            <div class="hidden md:flex items-center gap-1">
              <a
                routerLink="/"
                routerLinkActive
                #rlaDashboard="routerLinkActive"
                [routerLinkActiveOptions]="{ exact: true }"
                class="relative px-3 py-1.5 text-sm font-semibold transition-all group"
                [class.text-cyan-400]="rlaDashboard.isActive"
                [class.text-slate-400]="!rlaDashboard.isActive"
                [class.hover:text-fuchsia-400]="!rlaDashboard.isActive"
              >
                <!-- Active Background -->
                <span
                  class="absolute inset-0 rounded-lg transition-all duration-300"
                  [class.bg-cyan-500/10]="rlaDashboard.isActive"
                  [class.opacity-50]="rlaDashboard.isActive"
                  [class.opacity-0]="!rlaDashboard.isActive"
                  [class.group-hover:bg-fuchsia-500/10]="!rlaDashboard.isActive"
                  [class.group-hover:opacity-100]="!rlaDashboard.isActive"
                ></span>
                <!-- Underline -->
                <span
                  class="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full transition-all duration-300"
                  [class.bg-cyan-500]="rlaDashboard.isActive"
                  [class.shadow-[0_0_10px_rgba(0,210,255,0.9)]]="rlaDashboard.isActive"
                  [class.w-2/3]="rlaDashboard.isActive"
                  [class.w-0]="!rlaDashboard.isActive"
                  [class.group-hover:w-2/3]="!rlaDashboard.isActive"
                  [class.group-hover:bg-fuchsia-500]="!rlaDashboard.isActive"
                  [class.group-hover:shadow-[0_0_10px_rgba(232,121,249,0.9)]]="
                    !rlaDashboard.isActive
                  "
                ></span>
                <span class="relative">Dashboard</span>
              </a>

              <a
                routerLink="/projects"
                routerLinkActive
                #rlaProjects="routerLinkActive"
                class="relative px-3 py-1.5 text-sm font-medium transition-all group"
                [class.text-cyan-400]="rlaProjects.isActive"
                [class.text-slate-400]="!rlaProjects.isActive"
                [class.hover:text-fuchsia-400]="!rlaProjects.isActive"
              >
                <!-- Active/Hover Background -->
                <span
                  class="absolute inset-0 rounded-lg transition-all duration-300"
                  [class.bg-cyan-500/10]="rlaProjects.isActive"
                  [class.bg-fuchsia-500/0]="!rlaProjects.isActive"
                  [class.group-hover:bg-fuchsia-500/10]="!rlaProjects.isActive"
                ></span>
                <!-- Underline -->
                <span
                  class="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full transition-all duration-300"
                  [class.bg-cyan-500]="rlaProjects.isActive"
                  [class.shadow-[0_0_10px_rgba(0,210,255,0.9)]]="rlaProjects.isActive"
                  [class.w-2/3]="rlaProjects.isActive"
                  [class.w-0]="!rlaProjects.isActive"
                  [class.group-hover:w-2/3]="!rlaProjects.isActive"
                  [class.group-hover:bg-fuchsia-500]="!rlaProjects.isActive"
                  [class.group-hover:shadow-[0_0_10px_rgba(232,121,249,0.9)]]="
                    !rlaProjects.isActive
                  "
                ></span>
                <span class="relative">Projects</span>
              </a>

              <a
                routerLink="/tasks"
                routerLinkActive
                #rlaTasks="routerLinkActive"
                class="relative px-3 py-1.5 text-sm font-medium transition-all group"
                [class.text-cyan-400]="rlaTasks.isActive"
                [class.text-slate-400]="!rlaTasks.isActive"
                [class.hover:text-fuchsia-400]="!rlaTasks.isActive"
              >
                <!-- Active/Hover Background -->
                <span
                  class="absolute inset-0 rounded-lg transition-all duration-300"
                  [class.bg-cyan-500/10]="rlaTasks.isActive"
                  [class.bg-fuchsia-500/0]="!rlaTasks.isActive"
                  [class.group-hover:bg-fuchsia-500/10]="!rlaTasks.isActive"
                ></span>
                <!-- Underline -->
                <span
                  class="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full transition-all duration-300"
                  [class.bg-cyan-500]="rlaTasks.isActive"
                  [class.shadow-[0_0_10px_rgba(0,210,255,0.9)]]="rlaTasks.isActive"
                  [class.w-2/3]="rlaTasks.isActive"
                  [class.w-0]="!rlaTasks.isActive"
                  [class.group-hover:w-2/3]="!rlaTasks.isActive"
                  [class.group-hover:bg-fuchsia-500]="!rlaTasks.isActive"
                  [class.group-hover:shadow-[0_0_10px_rgba(232,121,249,0.9)]]="!rlaTasks.isActive"
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
                class="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pulse"
              ></span>
              <span class="text-xs text-slate-400 font-medium">{{
                auth.currentUserSig()?.email
              }}</span>
            </div>

            <!-- Settings link -->
            <a
              routerLink="/settings"
              class="p-2 text-slate-400 hover:text-fuchsia-400 transition-colors rounded-lg hover:bg-white/5"
              title="Settings"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                  clip-rule="evenodd"
                />
              </svg>
            </a>

            <!-- Cyberpunk logout button - solid border with glow -->
            <button
              (click)="auth.logout()"
              class="relative px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg overflow-hidden group transition-all duration-300 hover:scale-105"
            >
              <!-- Solid border -->
              <span class="absolute inset-0 rounded-lg border border-fuchsia-500 opacity-80"></span>
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

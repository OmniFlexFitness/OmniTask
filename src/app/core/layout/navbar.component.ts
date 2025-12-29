import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <!-- Top neon accent bar with animated glow -->
    <div class="h-[3px] w-full bg-gradient-to-r from-[#0073ff] via-fuchsia-500 to-[#0073ff] shadow-[0_0_12px_rgba(0,115,255,0.7),0_0_24px_rgba(165,100,255,0.5)]"></div>
    
    <nav class="sticky top-0 z-50 relative overflow-hidden">
      <!-- Dark base with subtle transparency -->
      <div class="absolute inset-0 bg-black/90 backdrop-blur-xl"></div>
      
      <!-- Grid overlay for cyber effect -->
      <div class="absolute inset-0 opacity-[0.08] pointer-events-none"
           style="background-image: 
             linear-gradient(rgba(0,115,255,0.3) 1px, transparent 1px),
             linear-gradient(90deg, rgba(0,115,255,0.3) 1px, transparent 1px);
           background-size: 24px 24px;">
      </div>
      
      <!-- Neon glow accents -->
      <div class="absolute left-0 top-0 w-64 h-full bg-gradient-to-r from-[#0073ff]/20 to-transparent pointer-events-none"></div>
      <div class="absolute right-0 top-0 w-64 h-full bg-gradient-to-l from-fuchsia-500/20 to-transparent pointer-events-none"></div>
      
      <!-- Bottom neon border -->
      <div class="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#0073ff]/60 to-transparent shadow-[0_0_8px_rgba(0,115,255,0.6)]"></div>
      
      <!-- Content -->
      <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-14">
          <!-- Left: Logo + Nav -->
          <div class="flex items-center gap-8">
            <div class="flex items-center gap-3 group">
              <!-- Logo with neon ring -->
              <div class="relative">
                <span class="absolute -inset-1 rounded-full bg-[#251247] blur-md opacity-90 group-hover:opacity-100 transition-opacity"></span>
                <span class="absolute -inset-0.5 rounded-full bg-[#251247] opacity-80"></span>
                <img src="assets/images/logo.png" alt="OmniFlex" class="relative h-9 w-9 rounded-full object-contain ring-1 ring-white/20" />
              </div>
              <div class="flex flex-col">
                <span class="text-[10px] uppercase tracking-[0.2em] text-[#0073ff]/80 font-medium">OmniFlex</span>
                <span class="text-lg font-bold text-white tracking-tight drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">OmniTask</span>
              </div>
            </div>

            <!-- Nav links with neon hover -->
            <div class="hidden md:flex items-center gap-1">
              <a
                routerLink="/"
                class="relative px-4 py-1.5 text-sm font-semibold text-[#3d9aff] hover:text-white transition group"
              >
                <span class="absolute inset-0 rounded-md bg-[#0073ff]/10 opacity-0 group-hover:opacity-100 transition"></span>
                <span class="absolute bottom-0 left-1/2 -translate-x-1/2 w-70 h-0.5 bg-[#0073ff] group-hover:w-3/4 transition-all shadow-[0_0_6px_rgba(0,115,255,0.8)]"></span>
                <span class="relative">Dashboard</span>
              </a>
              <a
                routerLink="/projects"
                class="relative px-4 py-1.5 text-sm font-medium text-gray-400 hover:text-white transition group"
              >
                <span class="absolute inset-0 rounded-md bg-fuchsia-500/10 opacity-0 group-hover:opacity-100 transition"></span>
                <span class="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-fuchsia-400 group-hover:w-3/4 transition-all shadow-[0_0_6px_rgba(165,100,255,0.8)]"></span>
                <span class="relative">Projects</span>
              </a>
              <a
                routerLink="/tasks"
                class="relative px-4 py-1.5 text-sm font-medium text-gray-400 hover:text-white transition group"
              >
                <span class="absolute inset-0 rounded-md bg-fuchsia-500/10 opacity-0 group-hover:opacity-100 transition"></span>
                <span class="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-fuchsia-400 group-hover:w-3/4 transition-all shadow-[0_0_6px_rgba(165,100,255,0.8)]"></span>
                <span class="relative">My Tasks</span>
              </a>
            </div>
          </div>

          <!-- Right: User + Logout -->
          <div class="hidden md:flex items-center gap-4">
            <!-- User email with subtle glow -->
            <div class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)] animate-pulse"></span>
              <span class="text-sm text-gray-400">{{ auth.currentUserSig()?.email }}</span>
            </div>
            
            <!-- Neon logout button with gradient outline -->
            <button
              (click)="auth.logout()"
              class="relative px-5 py-1.5 text-sm font-semibold rounded-full overflow-hidden group transition-all hover:scale-105"
            >
              <!-- Gradient border layer -->
              <span class="absolute inset-0 rounded-full bg-gradient-to-r from-fuchsia-500 via-purple-500 to-[#251247]"></span>
              <!-- Inner fill -->
              <span class="absolute inset-[2px] rounded-full bg-slate-950/90 group-hover:bg-slate-900/80 transition"></span>
              <!-- Outer glow on hover -->
              <span class="absolute -inset-1 opacity-0 group-hover:opacity-60 transition blur-md bg-gradient-to-r from-fuchsia-500 via-purple-500 to-[#251247]"></span>
              <!-- Text with gradient -->
              <span class="relative bg-gradient-to-r from-fuchsia-400 via-purple-400 to-[#3d9aff] bg-clip-text text-transparent group-hover:from-fuchsia-300 group-hover:via-purple-300 group-hover:to-[#5aabff] transition">Logout</span>
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

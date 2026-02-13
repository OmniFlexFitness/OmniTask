import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-[#050810] font-sans"
    >
      <!-- Animated Scanline Overlay -->
      <div class="cyber-scanlines"></div>

      <!-- Background with Cyberpunk Grid -->
      <div class="absolute inset-0 z-0 select-none">
        <img
          src="assets/img/27250823_abstract_pixel_design_banner_3112.jpg"
          alt="Background"
          class="w-full h-full object-cover opacity-40"
        />
        <div class="absolute inset-0 bg-[#050810]/90"></div>

        <!-- Animated Grid Pattern -->
        <div class="absolute inset-0 cyber-grid-bg opacity-60"></div>

        <!-- Circuit Lines Effect -->
        <div
          class="absolute inset-0 mix-blend-screen opacity-40"
          style="background: 
               repeating-linear-gradient(90deg, rgba(0,210,255,0.1) 0, rgba(0,210,255,0.1) 1px, transparent 1px, transparent 80px),
               repeating-linear-gradient(0deg, rgba(224,64,251,0.08) 0, rgba(224,64,251,0.08) 1px, transparent 1px, transparent 80px);"
        ></div>

        <!-- Neon Glow Orbs -->
        <div class="absolute inset-0">
          <div
            class="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-cyan-500/20 rounded-full blur-[120px] animate-pulse"
          ></div>
          <div
            class="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-fuchsia-500/20 rounded-full blur-[100px] animate-pulse"
            style="animation-delay: 1s;"
          ></div>
          <div
            class="absolute top-1/2 right-1/3 w-[300px] h-[300px] bg-pink-500/10 rounded-full blur-[80px] animate-pulse"
            style="animation-delay: 2s;"
          ></div>
        </div>
      </div>

      <!-- Main Content Container -->
      <div
        class="relative z-10 w-full max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
      >
        <!-- Brand Section -->
        <div class="space-y-8 text-center animate-fade-in-left">
          <!-- Logo & Badge -->
          <div
            class="flex flex-col items-center justify-center space-y-4 lg:flex-row lg:space-y-0 lg:space-x-6"
          >
            <div class="relative group">
              <!-- Logo - Normal Blend Mode -->
              <img
                src="assets/images/logo.png"
                alt="OmniFlex Logo"
                class="relative object-contain w-28 h-28 lg:w-36 lg:h-36 !shadow-none !rounded-none"
              />
            </div>

            <div class="flex flex-col items-center pt-2">
              <!-- System Status Badge -->
              <div
                class="inline-flex items-center px-4 py-1.5 mb-3 space-x-2 rounded-full border border-cyan-500/50 bg-cyan-950/40 backdrop-blur-md shadow-[0_0_15px_rgba(0,210,255,0.3)]"
              >
                <span class="relative flex w-2.5 h-2.5">
                  <span
                    class="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping bg-cyan-400"
                  ></span>
                  <span
                    class="relative inline-flex w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,210,255,0.8)]"
                  ></span>
                </span>
                <span class="text-xs font-bold tracking-[0.2em] text-cyan-300 uppercase"
                  >System Online</span
                >
              </div>

              <!-- Title with Cyber Font -->
              <h1
                class="text-6xl font-black leading-none tracking-tight md:text-7xl lg:text-8xl"
                style="font-family: 'Orbitron', sans-serif;"
              >
                <span class="text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]">OMNI</span
                ><span class="text-cyber-gradient">TASK</span>
              </h1>
            </div>
          </div>

          <p
            class="max-w-lg mx-auto font-light leading-relaxed text-xl text-slate-300 drop-shadow-md"
          >
            The next-generation project orchestration node for the
            <span class="font-semibold text-neon-blue">OmniFlex Ecosystem</span>. <br /><span
              class="text-slate-400"
              >Initialize your workspace.</span
            >
          </p>

          <!-- Decorative Data Lines -->
          <div class="hidden items-center gap-2 font-mono text-xs text-slate-500 lg:flex">
            <span class="text-cyan-500">&gt;</span>
            <span class="animate-pulse">AWAITING_AUTHENTICATION</span>
            <span class="w-2 h-4 animate-pulse bg-cyan-500/50"></span>
          </div>
        </div>

        <!-- Login Portal Card -->
        <div class="flex justify-center delay-200 animate-fade-in-right">
          <div class="relative w-full max-w-sm group">
            <!-- Neon Glow Effect behind card - solid color -->
            <div
              class="absolute -inset-1 rounded-2xl bg-fuchsia-500/30 blur-lg opacity-40 transition duration-500 group-hover:opacity-70 animate-pulse"
            ></div>

            <!-- Corner Brackets -->
            <div
              class="absolute -top-2 -left-2 w-6 h-6 border-t-2 border-l-2 border-cyan-500 opacity-70"
            ></div>
            <div
              class="absolute -top-2 -right-2 w-6 h-6 border-t-2 border-r-2 border-cyan-500 opacity-70"
            ></div>
            <div
              class="absolute -bottom-2 -left-2 w-6 h-6 border-b-2 border-l-2 border-fuchsia-500 opacity-70"
            ></div>
            <div
              class="absolute -bottom-2 -right-2 w-6 h-6 border-b-2 border-r-2 border-fuchsia-500 opacity-70"
            ></div>

            <div
              class="relative p-8 bg-[#0a0f1e]/90 backdrop-blur-2xl border border-cyan-500/30 rounded-2xl shadow-[0_0_50px_rgba(0,210,255,0.15),0_0_100px_rgba(224,64,251,0.15)]"
            >
              <!-- Top Line - solid color -->
              <div class="absolute top-0 left-4 right-4 h-[2px] bg-cyan-500/60"></div>

              <div class="mb-8 text-center">
                <h2
                  class="mb-2 text-2xl font-bold tracking-wide text-white"
                  style="font-family: 'Orbitron', sans-serif;"
                >
                  Identity Verification
                </h2>
                <div
                  class="w-20 h-1 mx-auto rounded-full bg-fuchsia-500 shadow-[0_0_10px_rgba(224,64,251,0.5)]"
                ></div>
              </div>

              <div class="space-y-6">
                <button
                  (click)="login()"
                  class="relative flex items-center justify-center w-full px-6 py-4 space-x-3 overflow-hidden font-medium text-white transition-all duration-300 border rounded-xl border-white/10 bg-white/5 group/btn hover:bg-white/10 hover:border-white/30"
                >
                  <!-- Shine Effect -->
                  <div
                    class="absolute inset-0 w-0 transition-all duration-500 bg-fuchsia-500/10 group-hover/btn:w-full"
                  ></div>

                  <div class="relative z-10 flex items-center justify-center gap-3 text-white">
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"
                      />
                    </svg>
                    <span class="tracking-wide">Authenticate with Google</span>
                  </div>
                </button>

                <div
                  class="flex items-center justify-between text-[10px] uppercase tracking-[0.15em] text-slate-500"
                >
                  <span class="flex items-center gap-1.5">
                    <svg class="w-3 h-3 text-cyan-500" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fill-rule="evenodd"
                        d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    Secure Connection
                  </span>
                  <span class="flex items-center gap-1.5">
                    <span
                      class="w-1.5 h-1.5 rounded-full animate-pulse bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                    ></span>
                    Encrypted
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Footer -->
      <div class="absolute bottom-6 w-full text-center z-10">
        <p class="text-[10px] text-slate-600 uppercase tracking-[0.25em] font-mono">
          <span class="text-cyan-600">//</span> OmniFlex Corporation
          <span class="text-purple-600">//</span> Authorized Personnel Only
          <span class="text-cyan-600">//</span>
        </p>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      @keyframes fadeLeft {
        from {
          opacity: 0;
          transform: translateX(-40px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      @keyframes fadeRight {
        from {
          opacity: 0;
          transform: translateX(40px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      .animate-fade-in-left {
        animation: fadeLeft 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      .animate-fade-in-right {
        animation: fadeRight 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      .delay-200 {
        animation-delay: 200ms;
      }
    `,
  ],
})
export class LoginComponent {
  authService = inject(AuthService);

  login() {
    this.authService.loginWithGoogle();
  }
}

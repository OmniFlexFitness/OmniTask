import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-[#050810] font-sans">
      <!-- Animated Scanline Overlay -->
      <div class="cyber-scanlines"></div>
      
      <!-- Background with Cyberpunk Grid -->
      <div class="absolute inset-0 z-0 select-none">
        <img src="assets/img/marble-brand-bg.jpeg" alt="Background" class="w-full h-full object-cover opacity-40">
        <div class="absolute inset-0 bg-[#050810]/90"></div>
        
        <!-- Animated Grid Pattern -->
        <div class="absolute inset-0 cyber-grid-bg opacity-60"></div>
        
        <!-- Circuit Lines Effect -->
        <div class="absolute inset-0 mix-blend-screen opacity-40" 
             style="background: 
               repeating-linear-gradient(90deg, rgba(0,210,255,0.1) 0, rgba(0,210,255,0.1) 1px, transparent 1px, transparent 80px),
               repeating-linear-gradient(0deg, rgba(224,64,251,0.08) 0, rgba(224,64,251,0.08) 1px, transparent 1px, transparent 80px);">
        </div>
        
        <!-- Neon Glow Orbs -->
        <div class="absolute inset-0">
          <div class="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-cyan-500/20 rounded-full blur-[120px] animate-pulse"></div>
          <div class="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-fuchsia-500/20 rounded-full blur-[100px] animate-pulse" style="animation-delay: 1s;"></div>
          <div class="absolute top-1/2 right-1/3 w-[300px] h-[300px] bg-pink-500/10 rounded-full blur-[80px] animate-pulse" style="animation-delay: 2s;"></div>
        </div>
      </div>

      <!-- Main Content Container -->
      <div class="relative z-10 w-full max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        
        <!-- Brand Section -->
        <div class="text-center lg:text-left space-y-8 animate-fade-in-left">
           <!-- Logo & Badge -->
          <div class="flex flex-col lg:flex-row items-center lg:items-start space-y-4 lg:space-y-0 lg:space-x-6">
            <div class="relative group">
                <!-- Logo - Normal Blend Mode -->
                <img src="assets/images/logo.png" alt="OmniFlex Logo" class="relative w-28 h-28 lg:w-36 lg:h-36 object-contain !shadow-none !rounded-none">
            </div>
            
            <div class="flex flex-col items-center lg:items-start pt-2">
                <!-- System Status Badge -->
                <div class="inline-flex items-center space-x-2 border border-cyan-500/50 bg-cyan-950/40 px-4 py-1.5 rounded-full backdrop-blur-md mb-3 shadow-[0_0_15px_rgba(0,210,255,0.3)]">
                    <span class="relative flex h-2.5 w-2.5">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                      <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-400 shadow-[0_0_8px_rgba(0,210,255,0.8)]"></span>
                    </span>
                    <span class="text-xs font-bold tracking-[0.2em] text-cyan-300 uppercase">System Online</span>
                </div>
                
                <!-- Title with Cyber Font -->
                <h1 class="text-6xl md:text-7xl lg:text-8xl font-black tracking-tight leading-none" style="font-family: 'Orbitron', sans-serif;">
                    <span class="text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]">OMNI</span><span class="text-cyber-gradient">TASK</span>
                </h1>
            </div>
          </div>
          
          <p class="text-xl text-slate-300 font-light max-w-lg mx-auto lg:mx-0 leading-relaxed drop-shadow-md">
            The next-generation project orchestration node for the <span class="text-neon-blue font-semibold">OmniFlex Ecosystem</span>.
            <br><span class="text-slate-400">Initialize your workspace.</span>
          </p>
          
          <!-- Decorative Data Lines -->
          <div class="hidden lg:flex items-center gap-2 text-xs text-slate-500 font-mono">
            <span class="text-cyan-500">&gt;</span>
            <span class="animate-pulse">AWAITING_AUTHENTICATION</span>
            <span class="w-2 h-4 bg-cyan-500/50 animate-pulse"></span>
          </div>
        </div>

        <!-- Login Portal Card -->
        <div class="flex justify-center lg:justify-end animate-fade-in-right delay-200">
          <div class="w-full max-w-sm relative group">
            <!-- Neon Glow Effect behind card - solid color -->
            <div class="absolute -inset-1 bg-fuchsia-500/30 rounded-2xl blur-lg opacity-40 group-hover:opacity-70 transition duration-500 animate-pulse"></div>
            
            <!-- Corner Brackets -->
            <div class="absolute -top-2 -left-2 w-6 h-6 border-t-2 border-l-2 border-cyan-500 opacity-70"></div>
            <div class="absolute -top-2 -right-2 w-6 h-6 border-t-2 border-r-2 border-cyan-500 opacity-70"></div>
            <div class="absolute -bottom-2 -left-2 w-6 h-6 border-b-2 border-l-2 border-fuchsia-500 opacity-70"></div>
            <div class="absolute -bottom-2 -right-2 w-6 h-6 border-b-2 border-r-2 border-fuchsia-500 opacity-70"></div>

            <div class="relative bg-[#0a0f1e]/90 backdrop-blur-2xl border border-cyan-500/30 p-8 rounded-2xl shadow-[0_0_50px_rgba(0,210,255,0.15),0_0_100px_rgba(224,64,251,0.15)]">
              <!-- Top Line - solid color -->
              <div class="absolute top-0 left-4 right-4 h-[2px] bg-cyan-500/60"></div>
              
              <div class="text-center mb-8">
                <h2 class="text-2xl font-bold text-white mb-2 tracking-wide" style="font-family: 'Orbitron', sans-serif;">Identity Verification</h2>
                <div class="h-1 w-20 bg-fuchsia-500 mx-auto rounded-full shadow-[0_0_10px_rgba(224,64,251,0.5)]"></div>
              </div>

              <div class="space-y-6">
                <button
                  (click)="login()"
                  class="w-full relative overflow-hidden group/btn py-4 px-6 rounded-xl font-semibold transition-all duration-300
                         bg-[#0a0f1e]/80
                         border-2 border-fuchsia-500/50 hover:border-fuchsia-400
                         shadow-[0_0_20px_rgba(224,64,251,0.2)] hover:shadow-[0_0_30px_rgba(224,64,251,0.4)]"
                >
                  <!-- Shine Effect -->
                  <div class="absolute inset-0 w-0 bg-fuchsia-500/10 transition-all duration-500 group-hover/btn:w-full"></div>
                  
                  <div class="relative z-10 flex items-center justify-center gap-3 text-white">
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
                    </svg>
                    <span class="tracking-wide">Authenticate with Google</span>
                  </div>
                </button>

                <div class="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-[0.15em]">
                  <span class="flex items-center gap-1.5">
                    <svg class="w-3 h-3 text-cyan-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/></svg>
                    Secure Connection
                  </span>
                  <span class="flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse"></span>
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
          <span class="text-cyan-600">//</span> OmniFlex Corporation <span class="text-purple-600">//</span> Authorized Personnel Only <span class="text-cyan-600">//</span>
        </p>
      </div>
    </div>
  `,
  styles: [`
    @keyframes fadeLeft {
      from { opacity: 0; transform: translateX(-40px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes fadeRight {
      from { opacity: 0; transform: translateX(40px); }
      to { opacity: 1; transform: translateX(0); }
    }
    .animate-fade-in-left { animation: fadeLeft 1s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    .animate-fade-in-right { animation: fadeRight 1s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    .delay-200 { animation-delay: 200ms; }
  `]
})
export class LoginComponent {
  authService = inject(AuthService);

  login() {
    this.authService.loginWithGoogle();
  }
}

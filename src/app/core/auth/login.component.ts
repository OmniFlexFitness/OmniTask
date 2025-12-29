import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-black font-sans">
      <!-- Background Image with Cyberpunk Overlay -->
      <div class="absolute inset-0 z-0 select-none">
        <img src="assets/img/marble-brand-bg.jpeg" alt="Background" class="w-full h-full object-cover">
        <div class="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-slate-950/40 to-fuchsia-800/20"></div>
        <div class="absolute inset-0 mix-blend-screen opacity-60 bg-[repeating-linear-gradient(90deg,rgba(59,130,246,0.14)_0,rgba(59,130,246,0.14)_1px,transparent_1px,transparent_120px)]"></div>
        <div class="absolute inset-0 mix-blend-screen opacity-60 bg-[repeating-linear-gradient(0deg,rgba(236,72,153,0.12)_0,rgba(236,72,153,0.12)_1px,transparent_1px,transparent_120px)]"></div>
      </div>

      <!-- Main Content Container -->
      <div class="relative z-10 w-full max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        
        <!-- Brand Section -->
        <div class="text-center lg:text-left space-y-8 animate-fade-in-left">
           <!-- Logo & Badge -->
          <div class="flex flex-col lg:flex-row items-center lg:items-start space-y-4 lg:space-y-0 lg:space-x-6">
            <div class="relative group">
                <div class="absolute -inset-1 bg-gradient-to-r from-cyan-400 to-purple-600 rounded-full blur opacity-40 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
                <img src="assets/images/logo.png" alt="OmniFlex Logo" class="relative w-24 h-24 lg:w-32 lg:h-32 object-contain drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]">
            </div>
            
            <div class="flex flex-col items-center lg:items-start pt-2">
                <div class="inline-flex items-center space-x-2 border border-cyan-500/30 bg-cyan-950/30 px-3 py-1 rounded-full backdrop-blur-md mb-2">
                    <span class="relative flex h-2 w-2">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                      <span class="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                    </span>
                    <span class="text-xs font-bold tracking-widest text-cyan-300 uppercase">System Online</span>
                </div>
                <h1 class="text-6xl md:text-7xl lg:text-8xl font-black tracking-tighter leading-none text-white drop-shadow-2xl">
                    OMNI<span class="text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-cyan-500">TASK</span>
                </h1>
            </div>
          </div>
          
          <p class="text-xl text-gray-300 font-light max-w-lg mx-auto lg:mx-0 leading-relaxed drop-shadow-md">
            The next-generation project orchestration node for the <span class="text-white font-semibold">OmniFlex Ecosystem</span>.
            <br>Initialize your workspace.
          </p>
        </div>

        <!-- Login Portal Card -->
        <div class="flex justify-center lg:justify-end animate-fade-in-right delay-200">
          <div class="w-full max-w-sm relative group">
            <!-- Neon Glow Effect behind card -->
            <div class="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-cyan-600 rounded-2xl blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
            
            <div class="relative bg-black/60 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-2xl">
              <div class="text-center mb-8">
                <h2 class="text-2xl font-bold text-white mb-2 tracking-wide">Identity Verification</h2>
                <div class="h-1 w-16 bg-gradient-to-r from-purple-500 to-cyan-500 mx-auto rounded-full"></div>
              </div>

              <div class="space-y-6">
                <button
                  (click)="login()"
                  class="w-full relative overflow-hidden group/btn ofx-gradient-button py-4 px-6 rounded-xl text-white font-medium !border-white/20"
                >
                  <div class="absolute inset-0 w-0 bg-gradient-to-r from-purple-600/30 to-cyan-600/30 transition-all duration-[250ms] ease-out group-hover/btn:w-full"></div>
                  
                  <svg class="w-5 h-5 relative z-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
                  </svg>
                  <span class="relative z-10 tracking-wide">Authenticate with Google</span>
                </button>

                <div class="flex items-center justify-between text-xs text-gray-500 uppercase tracking-widest">
                  <span>Secure Connection</span>
                  <span class="flex items-center space-x-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                    <span>Encrypted</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
      </div>
      
      <!-- Bottom Footer -->
      <div class="absolute bottom-6 w-full text-center">
        <p class="text-[10px] text-gray-600 uppercase tracking-[0.2em]">OmniFlex Corporation // Authorized Personnel Only</p>
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

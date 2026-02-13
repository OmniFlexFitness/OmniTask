import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  host: {
    style: 'display:block; position:absolute; inset:0; z-index:9999; overflow:hidden;',
  },
  template: `
    <div class="login-page">
      <!-- Background Layer -->
      <div class="login-bg">
        <img src="assets/img/27250823_abstract_pixel_design_banner_3112.jpg" alt="" />
        <div class="login-bg-tint"></div>
        <div class="login-bg-grid"></div>
      </div>

      <!-- Scanline effect -->
      <div class="cyber-scanlines"></div>

      <!-- Centered Content Area -->
      <div class="login-center">
        <div class="login-columns">
          <!-- Left: Brand -->
          <div class="brand-col">
            <div class="brand-logo-row">
              <img src="assets/images/logo.png" alt="OmniFlex Logo" class="brand-logo" />
              <div class="brand-text">
                <div class="status-badge">
                  <span class="dot-wrap">
                    <span class="dot-ping"></span>
                    <span class="dot-solid"></span>
                  </span>
                  <span class="status-label">System Online</span>
                </div>
                <h1 class="brand-title">
                  <span class="t-white">OMNI</span><span class="t-gradient">TASK</span>
                </h1>
              </div>
            </div>
            <p class="brand-desc">
              The next-generation project orchestration node for the
              <span class="brand-hl">OmniFlex Ecosystem</span>. <br /><span class="brand-sub"
                >Initialize your workspace.</span
              >
            </p>
            <div class="terminal-line">
              <span class="term-gt">&gt;</span>
              <span class="term-txt">AWAITING_AUTHENTICATION</span>
              <span class="term-cursor"></span>
            </div>
          </div>

          <!-- Right: Auth Card -->
          <div class="card-col">
            <div class="card-outer">
              <div class="card-glow"></div>
              <div class="bracket tl"></div>
              <div class="bracket tr"></div>
              <div class="bracket bl"></div>
              <div class="bracket br"></div>
              <div class="card-inner">
                <div class="card-accent-line"></div>
                <div class="card-head">
                  <h2>Identity Verification</h2>
                  <div class="card-bar"></div>
                </div>
                <button (click)="login()" class="auth-btn" type="button">
                  <span class="btn-shine"></span>
                  <span class="btn-label">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"
                      />
                    </svg>
                    Authenticate with Google
                  </span>
                </button>
                <div class="card-foot">
                  <span class="foot-item">
                    <svg fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fill-rule="evenodd"
                        d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    Secure Connection
                  </span>
                  <span class="foot-item">
                    <span class="enc-dot"></span>
                    Encrypted
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="login-foot">
        <span class="fc">//</span> OmniFlex Corporation <span class="fp">//</span> Authorized
        Personnel Only
        <span class="fc">//</span>
      </div>
    </div>
  `,
  styles: [
    `
      /* ── PAGE SHELL ────────────────────────── */
      .login-page {
        width: 100vw;
        height: 100vh;
        background: #050810;
        position: relative;
        overflow: hidden;
        font-family: sans-serif;
      }

      /* ── BACKGROUND ────────────────────────── */
      .login-bg {
        position: absolute;
        inset: 0;
        z-index: 0;
        user-select: none;
      }
      .login-bg img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0.35;
      }
      .login-bg-tint {
        position: absolute;
        inset: 0;
        background: rgba(5, 8, 16, 0.88);
      }
      .login-bg-grid {
        position: absolute;
        inset: 0;
        opacity: 0.45;
        background:
          repeating-linear-gradient(
            90deg,
            rgba(0, 210, 255, 0.06) 0,
            rgba(0, 210, 255, 0.06) 1px,
            transparent 1px,
            transparent 80px
          ),
          repeating-linear-gradient(
            0deg,
            rgba(224, 64, 251, 0.04) 0,
            rgba(224, 64, 251, 0.04) 1px,
            transparent 1px,
            transparent 80px
          );
      }

      /* ── CENTER BOX ────────────────────────── */
      .login-center {
        position: absolute;
        inset: 0;
        z-index: 10;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
      }

      .login-columns {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3rem;
        width: 100%;
        max-width: 72rem;
      }

      @media (min-width: 1024px) {
        .login-columns {
          flex-direction: row;
          gap: 4rem;
        }
      }

      /* ── BRAND COLUMN ──────────────────────── */
      .brand-col {
        flex: 1 1 0%;
        text-align: center;
        display: flex;
        flex-direction: column;
        gap: 1.75rem;
        animation: fadeL 0.9s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      @media (min-width: 1024px) {
        .brand-col {
          text-align: left;
        }
      }

      .brand-logo-row {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
      }
      @media (min-width: 1024px) {
        .brand-logo-row {
          flex-direction: row;
          gap: 1.5rem;
        }
      }

      .brand-logo {
        width: 7rem;
        height: 7rem;
        object-fit: contain;
      }
      @media (min-width: 1024px) {
        .brand-logo {
          width: 9rem;
          height: 9rem;
        }
      }

      .brand-text {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      @media (min-width: 1024px) {
        .brand-text {
          align-items: flex-start;
        }
      }

      /* Status Badge */
      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        border: 1px solid rgba(6, 182, 212, 0.4);
        background: rgba(8, 51, 68, 0.4);
        padding: 0.35rem 1rem;
        border-radius: 9999px;
        backdrop-filter: blur(12px);
        margin-bottom: 0.6rem;
        box-shadow: 0 0 14px rgba(0, 210, 255, 0.2);
      }
      .dot-wrap {
        position: relative;
        display: flex;
        width: 0.6rem;
        height: 0.6rem;
      }
      .dot-ping {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: #22d3ee;
        opacity: 0.75;
        animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
      }
      .dot-solid {
        position: relative;
        width: 0.6rem;
        height: 0.6rem;
        border-radius: 50%;
        background: #22d3ee;
        box-shadow: 0 0 8px rgba(0, 210, 255, 0.8);
      }
      .status-label {
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.2em;
        color: #67e8f9;
        text-transform: uppercase;
      }

      /* Title */
      .brand-title {
        font-size: 3.75rem;
        font-weight: 900;
        letter-spacing: -0.025em;
        line-height: 1;
        margin: 0;
        font-family: 'Orbitron', sans-serif;
      }
      @media (min-width: 768px) {
        .brand-title {
          font-size: 4.5rem;
        }
      }
      @media (min-width: 1024px) {
        .brand-title {
          font-size: 6rem;
        }
      }
      .t-white {
        color: #fff;
        filter: drop-shadow(0 0 30px rgba(255, 255, 255, 0.3));
      }
      .t-gradient {
        background: linear-gradient(to right, #a855f7, #06b6d4);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      /* Description */
      .brand-desc {
        font-size: 1.2rem;
        color: #cbd5e1;
        font-weight: 300;
        max-width: 32rem;
        margin: 0 auto;
        line-height: 1.7;
      }
      @media (min-width: 1024px) {
        .brand-desc {
          margin: 0;
        }
      }
      .brand-hl {
        color: #38bdf8;
        font-weight: 600;
      }
      .brand-sub {
        color: #94a3b8;
      }

      /* Terminal */
      .terminal-line {
        display: none;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.75rem;
        color: #64748b;
        font-family: monospace;
      }
      @media (min-width: 1024px) {
        .terminal-line {
          display: flex;
        }
      }
      .term-gt {
        color: #06b6d4;
      }
      .term-txt {
        animation: pulse 2s ease-in-out infinite;
      }
      .term-cursor {
        width: 0.5rem;
        height: 1rem;
        background: rgba(6, 182, 212, 0.5);
        animation: pulse 1s ease-in-out infinite;
      }

      /* ── CARD COLUMN ───────────────────────── */
      .card-col {
        flex: 0 0 auto;
        width: 100%;
        max-width: 24rem;
        animation: fadeR 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both;
      }

      .card-outer {
        position: relative;
      }

      .card-glow {
        position: absolute;
        inset: -4px;
        background: rgba(217, 70, 239, 0.22);
        border-radius: 1rem;
        filter: blur(16px);
        opacity: 0.4;
        animation: pulse 2s ease-in-out infinite;
      }

      /* Corner brackets */
      .bracket {
        position: absolute;
        width: 1.5rem;
        height: 1.5rem;
        z-index: 2;
      }
      .bracket.tl {
        top: -0.5rem;
        left: -0.5rem;
        border-top: 2px solid #06b6d4;
        border-left: 2px solid #06b6d4;
        opacity: 0.7;
      }
      .bracket.tr {
        top: -0.5rem;
        right: -0.5rem;
        border-top: 2px solid #06b6d4;
        border-right: 2px solid #06b6d4;
        opacity: 0.7;
      }
      .bracket.bl {
        bottom: -0.5rem;
        left: -0.5rem;
        border-bottom: 2px solid #d946ef;
        border-left: 2px solid #d946ef;
        opacity: 0.7;
      }
      .bracket.br {
        bottom: -0.5rem;
        right: -0.5rem;
        border-bottom: 2px solid #d946ef;
        border-right: 2px solid #d946ef;
        opacity: 0.7;
      }

      .card-inner {
        position: relative;
        background: rgba(10, 15, 30, 0.9);
        backdrop-filter: blur(24px);
        border: 1px solid rgba(6, 182, 212, 0.3);
        padding: 2rem;
        border-radius: 1rem;
        box-shadow:
          0 0 50px rgba(0, 210, 255, 0.12),
          0 0 100px rgba(224, 64, 251, 0.12);
      }
      .card-accent-line {
        position: absolute;
        top: 0;
        left: 1rem;
        right: 1rem;
        height: 2px;
        background: rgba(6, 182, 212, 0.5);
      }
      .card-head {
        text-align: center;
        margin-bottom: 2rem;
      }
      .card-head h2 {
        font-size: 1.5rem;
        font-weight: 700;
        color: #fff;
        margin: 0 0 0.5rem;
        letter-spacing: 0.05em;
        font-family: 'Orbitron', sans-serif;
      }
      .card-bar {
        height: 4px;
        width: 5rem;
        background: #d946ef;
        margin: 0 auto;
        border-radius: 9999px;
        box-shadow: 0 0 10px rgba(224, 64, 251, 0.5);
      }

      /* Auth button */
      .auth-btn {
        position: relative;
        width: 100%;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #fff;
        font-weight: 500;
        padding: 1rem 1.5rem;
        border-radius: 0.75rem;
        cursor: pointer;
        transition: all 0.3s;
        font-size: 1rem;
        display: block;
        margin-bottom: 1.25rem;
      }
      .auth-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.3);
      }
      .btn-shine {
        position: absolute;
        inset: 0;
        width: 0;
        background: rgba(217, 70, 239, 0.1);
        transition: width 0.5s;
      }
      .auth-btn:hover .btn-shine {
        width: 100%;
      }
      .btn-label {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        color: #fff;
      }
      .btn-label svg {
        width: 1.25rem;
        height: 1.25rem;
      }

      /* Card footer */
      .card-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 10px;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.15em;
      }
      .foot-item {
        display: flex;
        align-items: center;
        gap: 0.375rem;
      }
      .foot-item svg {
        width: 0.75rem;
        height: 0.75rem;
        color: #06b6d4;
      }
      .enc-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #34d399;
        box-shadow: 0 0 6px rgba(52, 211, 153, 0.8);
        animation: pulse 2s ease-in-out infinite;
      }

      /* ── PAGE FOOTER ───────────────────────── */
      .login-foot {
        position: absolute;
        bottom: 1.5rem;
        left: 0;
        right: 0;
        z-index: 10;
        text-align: center;
        font-size: 10px;
        color: #475569;
        text-transform: uppercase;
        letter-spacing: 0.25em;
        font-family: monospace;
      }
      .fc {
        color: #0891b2;
      }
      .fp {
        color: #7c3aed;
      }

      /* ── ANIMATIONS ────────────────────────── */
      @keyframes fadeL {
        from {
          opacity: 0;
          transform: translateX(-40px);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }
      @keyframes fadeR {
        from {
          opacity: 0;
          transform: translateX(40px);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }
      @keyframes ping {
        75%,
        100% {
          transform: scale(2);
          opacity: 0;
        }
      }
      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
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

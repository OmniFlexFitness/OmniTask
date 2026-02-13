import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Full-screen login overlay - uses fixed positioning to bypass parent layout -->
    <div class="login-wrapper">
      <!-- Background Layer -->
      <div class="login-bg">
        <img
          src="assets/img/27250823_abstract_pixel_design_banner_3112.jpg"
          alt=""
          class="login-bg-img"
        />
        <div class="login-bg-overlay"></div>
        <div class="login-bg-grid"></div>
      </div>

      <!-- Scanline effect -->
      <div class="cyber-scanlines"></div>

      <!-- Centered Content -->
      <div class="login-content">
        <!-- Brand Column -->
        <div class="login-brand">
          <!-- Logo + Badge Row -->
          <div class="brand-header">
            <img src="assets/images/logo.png" alt="OmniFlex Logo" class="brand-logo" />
            <div class="brand-title-group">
              <div class="status-badge">
                <span class="status-dot-wrapper">
                  <span class="status-dot-ping"></span>
                  <span class="status-dot"></span>
                </span>
                <span class="status-text">System Online</span>
              </div>
              <h1 class="brand-title">
                <span class="brand-title-omni">OMNI</span><span class="brand-title-task">TASK</span>
              </h1>
            </div>
          </div>

          <p class="brand-description">
            The next-generation project orchestration node for the
            <span class="brand-highlight">OmniFlex Ecosystem</span>.
            <br />
            <span class="brand-subtitle">Initialize your workspace.</span>
          </p>

          <div class="terminal-line">
            <span class="terminal-prompt">&gt;</span>
            <span class="terminal-text">AWAITING_AUTHENTICATION</span>
            <span class="terminal-cursor"></span>
          </div>
        </div>

        <!-- Auth Card Column -->
        <div class="login-card-wrapper">
          <div class="card-glow"></div>
          <!-- Corner Brackets -->
          <div class="corner corner-tl"></div>
          <div class="corner corner-tr"></div>
          <div class="corner corner-bl"></div>
          <div class="corner corner-br"></div>

          <div class="login-card">
            <div class="card-top-line"></div>
            <div class="card-header">
              <h2 class="card-title">Identity Verification</h2>
              <div class="card-divider"></div>
            </div>

            <div class="card-body">
              <button (click)="login()" class="auth-button">
                <div class="auth-button-shine"></div>
                <div class="auth-button-content">
                  <svg class="google-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"
                    />
                  </svg>
                  <span>Authenticate with Google</span>
                </div>
              </button>

              <div class="card-footer">
                <span class="footer-item">
                  <svg class="footer-icon" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fill-rule="evenodd"
                      d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  Secure Connection
                </span>
                <span class="footer-item">
                  <span class="encrypted-dot"></span>
                  Encrypted
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Footer -->
      <div class="login-footer">
        <p>
          <span class="footer-accent">//</span> OmniFlex Corporation
          <span class="footer-accent-alt">//</span> Authorized Personnel Only
          <span class="footer-accent">//</span>
        </p>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* ===== FULL-SCREEN WRAPPER ===== */
      .login-wrapper {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: #050810;
        font-family: sans-serif;
      }

      /* ===== BACKGROUND ===== */
      .login-bg {
        position: absolute;
        inset: 0;
        z-index: 0;
        user-select: none;
      }

      .login-bg-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0.4;
      }

      .login-bg-overlay {
        position: absolute;
        inset: 0;
        background: rgba(5, 8, 16, 0.9);
      }

      .login-bg-grid {
        position: absolute;
        inset: 0;
        opacity: 0.5;
        background:
          repeating-linear-gradient(
            90deg,
            rgba(0, 210, 255, 0.07) 0,
            rgba(0, 210, 255, 0.07) 1px,
            transparent 1px,
            transparent 80px
          ),
          repeating-linear-gradient(
            0deg,
            rgba(224, 64, 251, 0.05) 0,
            rgba(224, 64, 251, 0.05) 1px,
            transparent 1px,
            transparent 80px
          );
      }

      /* ===== CENTERED CONTENT ===== */
      .login-content {
        position: relative;
        z-index: 10;
        display: grid;
        grid-template-columns: 1fr;
        gap: 3rem;
        align-items: center;
        width: 100%;
        max-width: 72rem;
        padding: 0 1.5rem;
        margin: 0 auto;
      }

      @media (min-width: 1024px) {
        .login-content {
          grid-template-columns: 1fr 1fr;
          gap: 3.5rem;
        }
      }

      /* ===== BRAND SECTION ===== */
      .login-brand {
        text-align: center;
        display: flex;
        flex-direction: column;
        gap: 2rem;
        animation: fadeLeft 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }

      @media (min-width: 1024px) {
        .login-brand {
          text-align: left;
        }
      }

      .brand-header {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
      }

      @media (min-width: 1024px) {
        .brand-header {
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

      .brand-title-group {
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      @media (min-width: 1024px) {
        .brand-title-group {
          align-items: flex-start;
        }
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        border: 1px solid rgba(6, 182, 212, 0.4);
        background: rgba(8, 51, 68, 0.4);
        padding: 0.375rem 1rem;
        border-radius: 9999px;
        backdrop-filter: blur(12px);
        margin-bottom: 0.75rem;
        box-shadow: 0 0 15px rgba(0, 210, 255, 0.2);
      }

      .status-dot-wrapper {
        position: relative;
        display: flex;
        width: 0.625rem;
        height: 0.625rem;
      }

      .status-dot-ping {
        position: absolute;
        inset: 0;
        border-radius: 9999px;
        background: #22d3ee;
        opacity: 0.75;
        animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
      }

      .status-dot {
        position: relative;
        width: 0.625rem;
        height: 0.625rem;
        border-radius: 9999px;
        background: #22d3ee;
        box-shadow: 0 0 8px rgba(0, 210, 255, 0.8);
      }

      .status-text {
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.2em;
        color: #67e8f9;
        text-transform: uppercase;
      }

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

      .brand-title-omni {
        color: white;
        filter: drop-shadow(0 0 30px rgba(255, 255, 255, 0.3));
      }

      .brand-title-task {
        background: linear-gradient(to right, #a855f7, #06b6d4);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      .brand-description {
        font-size: 1.25rem;
        color: #cbd5e1;
        font-weight: 300;
        max-width: 32rem;
        margin: 0 auto;
        line-height: 1.7;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
      }

      @media (min-width: 1024px) {
        .brand-description {
          margin: 0;
        }
      }

      .brand-highlight {
        color: #38bdf8;
        font-weight: 600;
      }

      .brand-subtitle {
        color: #94a3b8;
      }

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

      .terminal-prompt {
        color: #06b6d4;
      }

      .terminal-text {
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }

      .terminal-cursor {
        width: 0.5rem;
        height: 1rem;
        background: rgba(6, 182, 212, 0.5);
        animation: pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }

      /* ===== AUTH CARD ===== */
      .login-card-wrapper {
        position: relative;
        max-width: 24rem;
        margin: 0 auto;
        width: 100%;
        animation: fadeRight 1s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both;
      }

      @media (min-width: 1024px) {
        .login-card-wrapper {
          margin: 0 0 0 auto;
        }
      }

      .card-glow {
        position: absolute;
        inset: -4px;
        background: rgba(217, 70, 239, 0.25);
        border-radius: 1rem;
        filter: blur(16px);
        opacity: 0.4;
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }

      .corner {
        position: absolute;
        width: 1.5rem;
        height: 1.5rem;
        z-index: 2;
      }

      .corner-tl {
        top: -0.5rem;
        left: -0.5rem;
        border-top: 2px solid #06b6d4;
        border-left: 2px solid #06b6d4;
        opacity: 0.7;
      }

      .corner-tr {
        top: -0.5rem;
        right: -0.5rem;
        border-top: 2px solid #06b6d4;
        border-right: 2px solid #06b6d4;
        opacity: 0.7;
      }

      .corner-bl {
        bottom: -0.5rem;
        left: -0.5rem;
        border-bottom: 2px solid #d946ef;
        border-left: 2px solid #d946ef;
        opacity: 0.7;
      }

      .corner-br {
        bottom: -0.5rem;
        right: -0.5rem;
        border-bottom: 2px solid #d946ef;
        border-right: 2px solid #d946ef;
        opacity: 0.7;
      }

      .login-card {
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

      .card-top-line {
        position: absolute;
        top: 0;
        left: 1rem;
        right: 1rem;
        height: 2px;
        background: rgba(6, 182, 212, 0.5);
      }

      .card-header {
        text-align: center;
        margin-bottom: 2rem;
      }

      .card-title {
        font-size: 1.5rem;
        font-weight: 700;
        color: white;
        margin: 0 0 0.5rem 0;
        letter-spacing: 0.05em;
        font-family: 'Orbitron', sans-serif;
      }

      .card-divider {
        height: 4px;
        width: 5rem;
        background: #d946ef;
        margin: 0 auto;
        border-radius: 9999px;
        box-shadow: 0 0 10px rgba(224, 64, 251, 0.5);
      }

      .card-body {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }

      .auth-button {
        position: relative;
        width: 100%;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: white;
        font-weight: 500;
        padding: 1rem 1.5rem;
        border-radius: 0.75rem;
        cursor: pointer;
        transition: all 0.3s;
        font-size: 1rem;
      }

      .auth-button:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.3);
      }

      .auth-button-shine {
        position: absolute;
        inset: 0;
        width: 0;
        background: rgba(217, 70, 239, 0.1);
        transition: width 0.5s;
      }

      .auth-button:hover .auth-button-shine {
        width: 100%;
      }

      .auth-button-content {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        color: white;
      }

      .google-icon {
        width: 1.25rem;
        height: 1.25rem;
      }

      .card-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 10px;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.15em;
      }

      .footer-item {
        display: flex;
        align-items: center;
        gap: 0.375rem;
      }

      .footer-icon {
        width: 0.75rem;
        height: 0.75rem;
        color: #06b6d4;
      }

      .encrypted-dot {
        width: 6px;
        height: 6px;
        border-radius: 9999px;
        background: #34d399;
        box-shadow: 0 0 6px rgba(52, 211, 153, 0.8);
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }

      /* ===== BOTTOM FOOTER ===== */
      .login-footer {
        position: absolute;
        bottom: 1.5rem;
        width: 100%;
        text-align: center;
        z-index: 10;
      }

      .login-footer p {
        font-size: 10px;
        color: #475569;
        text-transform: uppercase;
        letter-spacing: 0.25em;
        font-family: monospace;
        margin: 0;
      }

      .footer-accent {
        color: #0891b2;
      }
      .footer-accent-alt {
        color: #7c3aed;
      }

      /* ===== ANIMATIONS ===== */
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

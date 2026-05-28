import { Component, inject, signal, OnInit, OnDestroy, DestroyRef } from '@angular/core';
import { KeyboardShortcutsService } from './core/services/keyboard-shortcuts.service';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavbarComponent } from './core/layout/navbar.component';
import { DialogComponent } from './shared/components/dialog.component';
import { KeyboardShortcutsHelpComponent } from './shared/components/keyboard-shortcuts-help.component';
import { AuthService } from './core/auth/auth.service';
import { initOmniFlexEffects } from './core/theme/omniflex-effects';
import { initGlitchFx, destroyGlitchFx } from './core/theme/glitch-fx';
import { VersionService } from './core/services/version.service';
import { DEFAULT_VERSION } from './core/constants';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    NavbarComponent,
    DialogComponent,
    KeyboardShortcutsHelpComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  auth = inject(AuthService);
  versionService = inject(VersionService);
  private readonly keyboardShortcuts = inject(KeyboardShortcutsService);
  version = signal<string>(DEFAULT_VERSION);
  private destroyRef = inject(DestroyRef);
  private readonly onGlobalKeydown = (e: KeyboardEvent) => this.keyboardShortcuts.handleGlobalKeydown(e);
  private readonly onFocusSearch = (): void => {
    const el = document.getElementById('task-search-input') as HTMLInputElement | null;
    el?.focus();
  };

  private readonly updateModKey = (e: KeyboardEvent): void => {
    const held = e.ctrlKey || e.shiftKey || e.metaKey;
    document.body.classList.toggle('fx-modkey-held', held);
  };
  private readonly clearModKey = (): void => {
    document.body.classList.remove('fx-modkey-held');
  };

  ngOnInit(): void {
    this.versionService.getVersion()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => {
        this.version.set(v);
      });

    // Toggle a body class while Ctrl/Shift/Cmd is held so components can
    // reveal "modifier-gated" interactions (e.g. tag removal hint).
    window.addEventListener('keydown', this.updateModKey);
    window.addEventListener('keyup', this.updateModKey);
    window.addEventListener('blur', this.clearModKey);
    window.addEventListener('keydown', this.onGlobalKeydown);

    document.addEventListener('ot:focus-search', this.onFocusSearch);

    // Glitch + scramble hover effects (no-ops under prefers-reduced-motion).
    initGlitchFx();
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.updateModKey);
    window.removeEventListener('keyup', this.updateModKey);
    window.removeEventListener('blur', this.clearModKey);
    window.removeEventListener('keydown', this.onGlobalKeydown);
    document.removeEventListener('ot:focus-search', this.onFocusSearch);
    document.body.classList.remove('fx-modkey-held');
    destroyGlitchFx();
  }
}

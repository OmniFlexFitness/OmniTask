import { Component, inject, signal, OnInit, OnDestroy, DestroyRef } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavbarComponent } from './core/layout/navbar.component';
import { DialogComponent } from './shared/components/dialog.component';
import { AuthService } from './core/auth/auth.service';
import { initOmniFlexEffects } from './core/theme/omniflex-effects';
import { VersionService } from './core/services/version.service';
import { DEFAULT_VERSION } from './core/constants';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent, DialogComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  auth = inject(AuthService);
  versionService = inject(VersionService);
  version = signal<string>(DEFAULT_VERSION);
  private destroyRef = inject(DestroyRef);

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
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.updateModKey);
    window.removeEventListener('keyup', this.updateModKey);
    window.removeEventListener('blur', this.clearModKey);
    document.body.classList.remove('fx-modkey-held');
  }
}

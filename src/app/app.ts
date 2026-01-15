import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
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
export class App implements OnInit {
  auth = inject(AuthService);
  versionService = inject(VersionService);
  version = signal<string>(DEFAULT_VERSION);
  private destroyRef = inject(DestroyRef);

  ngOnInit() {
    this.versionService.getVersion()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => {
        this.version.set(v);
      });
  }
}

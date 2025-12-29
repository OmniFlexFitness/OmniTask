import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavbarComponent } from './core/layout/navbar.component';
import { AuthService } from './core/auth/auth.service';
import { VersionService } from './core/services/version.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  auth = inject(AuthService);
  versionService = inject(VersionService);
  version = signal<string>('0.0.01');
  private destroyRef = inject(DestroyRef);

  ngOnInit() {
    this.versionService.getVersion()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(v => {
        this.version.set(v);
      });
  }
}

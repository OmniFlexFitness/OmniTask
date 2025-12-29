import { AfterViewInit, Component, OnDestroy, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './core/layout/navbar.component';
import { AuthService } from './core/auth/auth.service';
import { initOmniFlexEffects } from './core/theme/omniflex-effects';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements AfterViewInit, OnDestroy {
  auth = inject(AuthService);
  private disposeEffects?: () => void;

  ngAfterViewInit() {
    this.disposeEffects = initOmniFlexEffects();
  }

  ngOnDestroy() {
    this.disposeEffects?.();
  }
}

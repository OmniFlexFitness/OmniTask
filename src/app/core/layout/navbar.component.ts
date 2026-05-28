import { Component, inject, ChangeDetectionStrategy, computed, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';
import { PermissionsService } from '../services/permissions.service';
import { SUPER_ADMIN_EMAIL } from '../constants';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavbarComponent {
  readonly auth = inject(AuthService);
  readonly permissions = inject(PermissionsService);
  readonly router = inject(Router);

  mobileMenuOpen = signal(false);

  /**
   * Admins, the designated super-admin email, and any user flagged
   * `isSuperAdmin` see the Admin portal link in the top bar.
   */
  readonly canSeeAdminLink = computed(() => {
    const user = this.auth.currentUserSig();
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) return true;
    return this.permissions.currentPermissions().isSuperAdmin;
  });

  constructor() {
    document.addEventListener('ot:escape', () => this.closeMobileMenu());

    // Close on navigation
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.mobileMenuOpen.set(false);
    });

    // Close on escape
    effect(() => {
      const open = this.mobileMenuOpen();
      if (!open) return;
      const onKeyDown = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') this.mobileMenuOpen.set(false);
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
    });
  }

  toggleMobileMenu() {
    this.mobileMenuOpen.update((v) => !v);
  }

  closeMobileMenu() {
    this.mobileMenuOpen.set(false);
  }
}

import { Component, inject, ChangeDetectionStrategy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
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
}

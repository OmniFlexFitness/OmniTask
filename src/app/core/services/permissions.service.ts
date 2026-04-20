import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import {
  DEFAULT_USER_PERMISSIONS,
  UserPermissions,
  UserProfile,
  resolvePermissions,
} from '../models/user.model';
import { SUPER_ADMIN_EMAIL } from '../constants';

/**
 * Centralised permission resolution. All feature code should consult this
 * service rather than reading `user.permissions` directly so that super-admin
 * overrides and the legacy `role === 'admin'` grant stay in one place.
 */
@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private auth = inject(AuthService);

  /**
   * Effective permissions for the currently signed-in user.
   * Admins and the designated super-admin always receive full permissions.
   */
  readonly currentPermissions = computed<UserPermissions>(() => {
    const user = this.auth.currentUserSig();
    return this.resolveFor(user);
  });

  readonly isSuperAdmin = computed(() => this.currentPermissions().isSuperAdmin);

  /**
   * Resolve the effective permissions for an arbitrary user profile.
   * The designated super-admin email and anyone with role === 'admin' are
   * granted the full permission set regardless of their stored map.
   */
  resolveFor(user: UserProfile | null | undefined): UserPermissions {
    if (!user) return { ...DEFAULT_USER_PERMISSIONS, isSuperAdmin: false };

    const base = resolvePermissions(user);

    if (user.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      return {
        canCreateProjects: true,
        canCreateTasks: true,
        canDeleteProjects: true,
        canDeleteTasks: true,
        canInviteMembers: true,
        isSuperAdmin: true,
      };
    }

    if (user.role === 'admin') {
      return {
        canCreateProjects: true,
        canCreateTasks: true,
        canDeleteProjects: true,
        canDeleteTasks: true,
        canInviteMembers: true,
        isSuperAdmin: base.isSuperAdmin,
      };
    }

    return base;
  }

  /**
   * Throw a user-facing error if the current user lacks the given permission.
   * Used at the top of mutating service methods so that a denied Firestore
   * write surfaces as a clear message rather than a cryptic rules error.
   */
  requirePermission(key: keyof UserPermissions): void {
    if (!this.currentPermissions()[key]) {
      throw new Error(
        `You do not have permission to perform this action (missing ${key}). ` +
          `Please contact an administrator.`,
      );
    }
  }
}

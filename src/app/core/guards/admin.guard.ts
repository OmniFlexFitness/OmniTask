import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { map, take, tap } from 'rxjs/operators';
import { SUPER_ADMIN_EMAIL } from '../constants';

/**
 * Guard for the admin dashboard. Admins (role === 'admin') and the
 * designated super-admin can access it.
 */
export const adminGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.userProfile$.pipe(
    take(1),
    map(
      (profile) =>
        !!profile &&
        (profile.role === 'admin' ||
          profile.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()),
    ),
    tap((allowed) => {
      if (!allowed) {
        router.navigate(['/']);
      }
    }),
  );
};

/**
 * Guard for super-admin-only areas (permissions management). Restricted
 * to the designated super-admin email and users flagged `isSuperAdmin`.
 */
export const superAdminGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.userProfile$.pipe(
    take(1),
    map((profile) => {
      if (!profile) return false;
      if (profile.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) return true;
      return profile.permissions?.isSuperAdmin === true;
    }),
    tap((allowed) => {
      if (!allowed) {
        router.navigate(['/']);
      }
    }),
  );
};

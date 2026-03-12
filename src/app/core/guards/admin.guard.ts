import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { map, take, tap } from 'rxjs/operators';

export const adminGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.user$.pipe(
    take(1),
    map(() => {
      const user = auth.currentUserSig();
      return !!user && user.role === 'admin';
    }),
    tap((isAdmin) => {
      if (!isAdmin) {
        router.navigate(['/']);
      }
    }),
  );
};

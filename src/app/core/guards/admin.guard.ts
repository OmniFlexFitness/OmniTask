import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { map, take, tap } from 'rxjs/operators';

export const adminGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.user$.pipe(
    take(1),
    map((firebaseUser) => {
      if (!firebaseUser) return false;
      const user = auth.currentUserSig();
      // This check helps ensure the profile in the signal corresponds to the user from the auth stream.
      return !!user && user.uid === firebaseUser.uid && user.role === 'admin';
    }),
    tap((isAdmin) => {
      if (!isAdmin) {
        router.navigate(['/']);
      }
    }),
  );
};

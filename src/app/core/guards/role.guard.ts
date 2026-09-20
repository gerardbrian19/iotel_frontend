import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models';

/** Requires the given role; signed-in users with another role are sent to their own portal. */
export const roleGuard =
  (role: UserRole): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const user = auth.currentUser();
    if (!user) return router.createUrlTree(['/auth/login']);
    return user.role === role ? true : router.createUrlTree([`/${user.role}`]);
  };

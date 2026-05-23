import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models';

export const roleGuard = (role: UserRole): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.currentUser()?.role === role
    ? true
    : router.createUrlTree(['/auth/login']);
};

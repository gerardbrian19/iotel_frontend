import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/auth/login', pathMatch: 'full' },
  {
    path: 'auth',
    loadChildren: () =>
      import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES),
  },
  {
    path: 'customer',
    canActivate: [authGuard, roleGuard('customer')],
    loadChildren: () =>
      import('./features/customer/customer.routes').then(m => m.CUSTOMER_ROUTES),
  },
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard('admin')],
    loadChildren: () =>
      import('./features/admin/admin.routes').then(m => m.ADMIN_ROUTES),
  },
  {
    path: 'staff',
    canActivate: [authGuard, roleGuard('staff')],
    loadChildren: () =>
      import('./features/staff/staff.routes').then(m => m.STAFF_ROUTES),
  },
  { path: '**', redirectTo: '/auth/login' },
];


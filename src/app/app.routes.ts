import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/landing/landing.component').then(m => m.LandingComponent),
  },
  {
    path: 'auth',
    canActivate: [guestGuard],
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
  // Terms of Service / Privacy Policy: public, whether or not someone is signed in.
  {
    path: 'legal/terms',
    data: { docId: 'terms' },
    loadComponent: () =>
      import('./features/legal/legal-page.component').then(m => m.LegalPageComponent),
  },
  {
    path: 'legal/privacy',
    data: { docId: 'privacy' },
    loadComponent: () =>
      import('./features/legal/legal-page.component').then(m => m.LegalPageComponent),
  },
  { path: '**', redirectTo: '' },
];


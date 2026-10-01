import { Routes } from '@angular/router';

export const STAFF_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./shell/staff-shell.component').then(m => m.StaffShellComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./dashboard/dashboard.component').then(m => m.StaffDashboardComponent) },
      { path: 'orders', loadComponent: () => import('./orders/orders.component').then(m => m.StaffOrdersComponent) },
      { path: 'inventory', loadComponent: () => import('./inventory/inventory.component').then(m => m.StaffInventoryComponent) },
      { path: 'bookings', loadComponent: () => import('../../shared/components/bookings-board/bookings-board.component').then(m => m.BookingsBoardComponent) },
      { path: 'messages', loadComponent: () => import('./messages/messages.component').then(m => m.StaffMessagesComponent) },
      { path: 'account', loadComponent: () => import('../../shared/components/account-security/account-security.component').then(m => m.AccountSecurityComponent) },
    ],
  },
];

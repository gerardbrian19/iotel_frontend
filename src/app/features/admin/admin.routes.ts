import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./shell/admin-shell.component').then(m => m.AdminShellComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'orders', loadComponent: () => import('./orders/orders.component').then(m => m.AdminOrdersComponent) },
      { path: 'products', loadComponent: () => import('./products/products.component').then(m => m.AdminProductsComponent) },
      { path: 'inventory', loadComponent: () => import('./inventory/inventory.component').then(m => m.AdminInventoryComponent) },
      { path: 'bookings', loadComponent: () => import('../../shared/components/bookings-board/bookings-board.component').then(m => m.BookingsBoardComponent) },
      { path: 'messages', loadComponent: () => import('./messages/messages.component').then(m => m.AdminMessagesComponent) },
      { path: 'users', loadComponent: () => import('./users/users.component').then(m => m.AdminUsersComponent) },
    ],
  },
];

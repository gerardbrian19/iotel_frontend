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
      { path: 'services', loadComponent: () => import('../../shared/components/services-manager/services-manager.component').then(m => m.ServicesManagerComponent) },
      { path: 'payments', loadComponent: () => import('../../shared/components/payment-review-queue/payment-review-queue.component').then(m => m.PaymentReviewQueueComponent) },
      { path: 'cancellations', loadComponent: () => import('../../shared/components/cancellation-queue/cancellation-queue.component').then(m => m.CancellationQueueComponent) },
      { path: 'payment-receivers', loadComponent: () => import('./payment-receivers/payment-receivers.component').then(m => m.AdminPaymentReceiversComponent) },
      { path: 'bookings', loadComponent: () => import('../../shared/components/bookings-board/bookings-board.component').then(m => m.BookingsBoardComponent) },
      { path: 'messages', loadComponent: () => import('./messages/messages.component').then(m => m.AdminMessagesComponent) },
      { path: 'activity', loadComponent: () => import('./activity/activity.component').then(m => m.AdminActivityComponent) },
      { path: 'users', loadComponent: () => import('./users/users.component').then(m => m.AdminUsersComponent) },
      { path: 'account', loadComponent: () => import('../../shared/components/account-security/account-security.component').then(m => m.AccountSecurityComponent) },
    ],
  },
];

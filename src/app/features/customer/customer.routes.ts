import { Routes } from '@angular/router';

export const CUSTOMER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./shell/customer-shell.component').then(m => m.CustomerShellComponent),
    children: [
      { path: '', redirectTo: 'catalog', pathMatch: 'full' },
      {
        path: 'catalog',
        loadComponent: () =>
          import('./catalog/catalog.component').then(m => m.CatalogComponent),
      },
      {
        path: 'cart',
        loadComponent: () =>
          import('./cart/cart.component').then(m => m.CartComponent),
      },
      {
        path: 'checkout',
        loadComponent: () =>
          import('./checkout/checkout.component').then(m => m.CheckoutComponent),
      },
      {
        path: 'orders/:id/confirmation',
        loadComponent: () =>
          import('./order-confirmation/order-confirmation.component').then(m => m.OrderConfirmationComponent),
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('./orders/orders.component').then(m => m.OrdersComponent),
      },
      {
        path: 'addresses',
        loadComponent: () =>
          import('./addresses/addresses.component').then(m => m.AddressesComponent),
      },
      {
        path: 'services',
        loadComponent: () =>
          import('./services/services.component').then(m => m.ServicesComponent),
      },
      {
        path: 'messages',
        loadComponent: () =>
          import('./messages/messages.component').then(m => m.MessagesComponent),
      },
    ],
  },
];

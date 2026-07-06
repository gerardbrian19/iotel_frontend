import { Routes } from '@angular/router';

export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./settings.component').then(m => m.SettingsComponent),
    children: [
      { path: '', redirectTo: 'profile', pathMatch: 'full' },
      {
        path: 'profile',
        loadComponent: () =>
          import('./profile/profile.component').then(m => m.ProfileComponent),
      },
      {
        path: 'addresses',
        loadComponent: () =>
          import('../addresses/addresses.component').then(m => m.AddressesComponent),
      },
      {
        path: 'payment-methods',
        loadComponent: () =>
          import('./payment-methods/payment-methods.component').then(m => m.PaymentMethodsComponent),
      },
      {
        path: 'wallet',
        loadComponent: () =>
          import('./wallet/wallet.component').then(m => m.WalletComponent),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./notifications/notifications.component').then(m => m.NotificationsComponent),
      },
      {
        path: 'privacy',
        loadComponent: () =>
          import('./privacy/privacy.component').then(m => m.PrivacyComponent),
      },
      {
        path: 'security',
        loadComponent: () =>
          import('./security/security.component').then(m => m.SecurityComponent),
      },
      {
        path: 'language',
        loadComponent: () =>
          import('./language/language.component').then(m => m.LanguageComponent),
      },
      {
        path: 'chat',
        loadComponent: () =>
          import('./chat-settings/chat-settings.component').then(m => m.ChatSettingsComponent),
      },
      {
        path: 'linked-accounts',
        loadComponent: () =>
          import('./linked-accounts/linked-accounts.component').then(m => m.LinkedAccountsComponent),
      },
      {
        path: 'help',
        loadComponent: () =>
          import('./help/help.component').then(m => m.HelpComponent),
      },
      {
        path: 'about',
        loadComponent: () =>
          import('../about/about.component').then(m => m.AboutComponent),
      },
    ],
  },
];

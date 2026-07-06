import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { AuthService } from '../../../core/services/auth.service';

interface SettingsItem {
  label: string;
  icon: string;
  route?: string;
  action?: () => void;
  danger?: boolean;
  dividerBefore?: boolean;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NzMenuModule,
    NzIconModule,
    NzDividerModule,
    NzButtonModule,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.currentUser;

  readonly settingsGroups: { title: string; items: SettingsItem[] }[] = [
    {
      title: 'Account',
      items: [
        { label: 'Profile', icon: 'user', route: '/customer/settings/profile' },
        { label: 'My Addresses', icon: 'environment', route: '/customer/settings/addresses' },
        { label: 'Bank Accounts / Cards', icon: 'credit-card', route: '/customer/settings/payment-methods' },
        { label: 'My Wallet', icon: 'wallet', route: '/customer/settings/wallet' },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { label: 'Notifications', icon: 'bell', route: '/customer/settings/notifications' },
        { label: 'Privacy Settings', icon: 'lock', route: '/customer/settings/privacy' },
        { label: 'Account Security', icon: 'safety', route: '/customer/settings/security' },
        { label: 'Language', icon: 'global', route: '/customer/settings/language' },
        { label: 'Chat Settings', icon: 'message', route: '/customer/settings/chat' },
      ],
    },
    {
      title: 'Connected',
      items: [
        { label: 'Linked Accounts', icon: 'link', route: '/customer/settings/linked-accounts' },
      ],
    },
    {
      title: 'Support',
      items: [
        { label: 'Help Centre', icon: 'question-circle', route: '/customer/settings/help' },
        { label: 'About', icon: 'info-circle', route: '/customer/settings/about' },
      ],
    },
  ];

  logout(): void {
    this.auth.logout();
  }
}

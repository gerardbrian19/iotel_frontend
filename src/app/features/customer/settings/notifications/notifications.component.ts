import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { FormsModule } from '@angular/forms';

interface NotificationSetting {
  key: string;
  label: string;
  description: string;
  icon: string;
  push: boolean;
  email: boolean;
  sms: boolean;
}

@Component({
  selector: 'app-settings-notifications',
  standalone: true,
  imports: [FormsModule, NzSwitchModule, NzDividerModule, NzIconModule],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsComponent {
  readonly settings = signal<NotificationSetting[]>([
    {
      key: 'orders',
      label: 'Order Updates',
      description: 'Shipping, delivery, and status changes for your orders.',
      icon: 'shopping',
      push: true,
      email: true,
      sms: false,
    },
    {
      key: 'promotions',
      label: 'Promotions & Offers',
      description: 'Exclusive deals, discounts, and new arrivals.',
      icon: 'tag',
      push: true,
      email: false,
      sms: false,
    },
    {
      key: 'messages',
      label: 'Messages',
      description: 'New messages from support and staff.',
      icon: 'message',
      push: true,
      email: true,
      sms: false,
    },
    {
      key: 'account',
      label: 'Account Activity',
      description: 'Login alerts and security-related events.',
      icon: 'safety',
      push: true,
      email: true,
      sms: true,
    },
  ]);

  toggle(key: string, channel: 'push' | 'email' | 'sms', value: boolean): void {
    this.settings.update(list =>
      list.map(s => (s.key === key ? { ...s, [channel]: value } : s))
    );
  }
}

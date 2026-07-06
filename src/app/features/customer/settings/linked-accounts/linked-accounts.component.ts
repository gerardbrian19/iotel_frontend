import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzMessageService } from 'ng-zorro-antd/message';
import { inject } from '@angular/core';

interface LinkedAccount {
  provider: string;
  icon: string;
  connected: boolean;
  detail?: string;
}

@Component({
  selector: 'app-settings-linked-accounts',
  standalone: true,
  imports: [NzButtonModule, NzIconModule, NzTagModule, NzDividerModule],
  templateUrl: './linked-accounts.component.html',
  styleUrl: './linked-accounts.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinkedAccountsComponent {
  private readonly message = inject(NzMessageService);

  readonly accounts = signal<LinkedAccount[]>([
    { provider: 'Google', icon: 'google', connected: true, detail: 'user@gmail.com' },
    { provider: 'Facebook', icon: 'facebook', connected: false },
    { provider: 'Apple', icon: 'apple', connected: false },
    { provider: 'Phone Number', icon: 'mobile', connected: true, detail: '+63 917 XXX XXXX' },
  ]);

  toggle(provider: string): void {
    this.accounts.update(list =>
      list.map(a => {
        if (a.provider !== provider) return a;
        const connected = !a.connected;
        this.message.success(connected ? `${provider} linked.` : `${provider} disconnected.`);
        return { ...a, connected, detail: connected ? a.detail : undefined };
      })
    );
  }
}

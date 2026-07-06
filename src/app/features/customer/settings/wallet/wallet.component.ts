import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';

@Component({
  selector: 'app-settings-wallet',
  standalone: true,
  imports: [
    DecimalPipe,
    NzCardModule,
    NzButtonModule,
    NzIconModule,
    NzTagModule,
    NzDividerModule,
    NzStatisticModule,
  ],
  templateUrl: './wallet.component.html',
  styleUrl: './wallet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletComponent {
  readonly balance = signal(1250.00);

  readonly transactions = signal([
    { id: 1, label: 'Top-up via GCash', amount: 500, type: 'credit', date: 'Jun 28, 2026' },
    { id: 2, label: 'Order #ORD-1042', amount: -320, type: 'debit', date: 'Jun 25, 2026' },
    { id: 3, label: 'Top-up via Bank Transfer', amount: 1000, type: 'credit', date: 'Jun 20, 2026' },
    { id: 4, label: 'Order #ORD-1038', amount: -430, type: 'debit', date: 'Jun 18, 2026' },
  ]);
}

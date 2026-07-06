import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzEmptyModule } from 'ng-zorro-antd/empty';

interface PaymentMethod {
  id: number;
  type: 'card' | 'bank';
  label: string;
  detail: string;
  isDefault: boolean;
}

@Component({
  selector: 'app-settings-payment-methods',
  standalone: true,
  imports: [
    NzCardModule,
    NzButtonModule,
    NzIconModule,
    NzTagModule,
    NzDividerModule,
    NzModalModule,
    NzEmptyModule,
  ],
  templateUrl: './payment-methods.component.html',
  styleUrl: './payment-methods.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentMethodsComponent {
  readonly methods = signal<PaymentMethod[]>([
    { id: 1, type: 'card', label: 'Visa ending in 4242', detail: 'Expires 08/27', isDefault: true },
    { id: 2, type: 'bank', label: 'BDO Savings Account', detail: '••••••••1234', isDefault: false },
  ]);

  remove(id: number): void {
    this.methods.update(list => list.filter(m => m.id !== id));
  }

  setDefault(id: number): void {
    this.methods.update(list => list.map(m => ({ ...m, isDefault: m.id === id })));
  }
}

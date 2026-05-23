import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { OrderService } from '../../../core/services/order.service';
import { Order } from '../../../core/models';

@Component({
  selector: 'app-staff-orders',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, NzCardModule, NzTagModule, NzButtonModule, NzCheckboxModule, NzSelectModule, NzAlertModule],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffOrdersComponent {
  private readonly orderService = inject(OrderService);
  private readonly msg = inject(NzMessageService);

  readonly orders = this.orderService.orders;
  readonly tabs: ('Pending' | 'Processing' | 'All')[] = ['Pending', 'Processing', 'All'];
  readonly activeTab = signal<'Pending' | 'Processing' | 'All'>('Pending');
  readonly removedItems = signal<Record<string, Set<number>>>({});

  readonly filtered = computed(() => {
    const tab = this.activeTab();
    return tab === 'All' ? this.orders() : this.orders().filter(o => o.status === tab);
  });

  toggleRemoveItem(orderId: string, productId: number) {
    this.removedItems.update(m => {
      const s = new Set(m[orderId] ?? []);
      s.has(productId) ? s.delete(productId) : s.add(productId);
      return { ...m, [orderId]: s };
    });
  }

  isRemoved(orderId: string, productId: number | undefined) { if (productId === undefined) return false; return this.removedItems()[orderId]?.has(productId) ?? false; }

  prepareOrder(order: Order) {
    this.orderService.updateStatus(order.id, 'Processing').subscribe(() =>
      this.msg.success(`Order ${order.id} is now being processed`)
    );
  }

  confirmReady(order: Order) {
    this.orderService.updateStatus(order.id, 'Shipped').subscribe(() =>
      this.msg.success(`Order ${order.id} marked as Shipped`)
    );
  }

  tabCount(tab: 'Pending' | 'Processing' | 'All') {
    return tab === 'All' ? this.orders().length : this.orders().filter(o => o.status === tab).length;
  }
}

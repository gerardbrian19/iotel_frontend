import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { ORDER_STATUSES, Order, OrderStatus } from '../../../core/models';
import { ORDER_STATUS_COLORS, paymentBadge, staffAction } from '../../../core/orders/order-view';
import { OrderService } from '../../../core/services/order.service';
import { OrderActionsComponent } from '../../../shared/components/order-actions/order-actions.component';
import { OrderDetailComponent } from '../../../shared/components/order-detail/order-detail.component';

type TabStatus = 'All' | OrderStatus;

@Component({
  selector: 'app-admin-orders',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzTableModule,
    NzTagModule,
    OrderActionsComponent,
    OrderDetailComponent,
  ],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOrdersComponent {
  private readonly orderService = inject(OrderService);

  readonly statusColors = ORDER_STATUS_COLORS;
  readonly paymentBadge = paymentBadge;
  readonly tabs: TabStatus[] = ['All', ...ORDER_STATUSES];
  readonly activeTab = signal<TabStatus>('All');
  readonly search = signal('');
  readonly expandedOrders = signal<ReadonlySet<string>>(new Set());

  readonly orders = this.orderService.orders;
  readonly loading = this.orderService.loading;
  readonly error = this.orderService.error;

  readonly filtered = computed(() => {
    let list = this.orders();
    if (this.activeTab() !== 'All') list = list.filter((o) => o.status === this.activeTab());
    const q = this.search().trim().toLowerCase();
    if (q) {
      list = list.filter(
        (o) =>
          o.code.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.address.fullName.toLowerCase().includes(q),
      );
    }
    return list;
  });

  countTab(tab: TabStatus): number {
    return tab === 'All'
      ? this.orders().length
      : this.orders().filter((o) => o.status === tab).length;
  }

  needsAction(order: Order): boolean {
    return staffAction(order) !== null;
  }

  toggleExpand(id: string): void {
    this.expandedOrders.update((open) => {
      const next = new Set(open);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }
}

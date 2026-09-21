import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { Order, OrderStatus } from '../../../core/models';
import { ORDER_STATUS_COLORS, paymentBadge } from '../../../core/orders/order-view';
import { OrderService } from '../../../core/services/order.service';
import { OrderActionsComponent } from '../../../shared/components/order-actions/order-actions.component';
import { OrderDetailComponent } from '../../../shared/components/order-detail/order-detail.component';
import { PLACEHOLDER_IMAGE, onImageError } from '../../../shared/utils/product-image';

type TabStatus = 'All' | OrderStatus;

/** How many item pictures the list shows before "+n more". */
const THUMBNAILS = 4;

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [
    RouterLink,
    CurrencyPipe,
    DatePipe,
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzEmptyModule,
    NzIconModule,
    NzInputModule,
    NzSpinModule,
    NzTagModule,
    OrderActionsComponent,
    OrderDetailComponent,
  ],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrdersComponent {
  private readonly orderService = inject(OrderService);

  readonly statusColors = ORDER_STATUS_COLORS;
  readonly paymentBadge = paymentBadge;
  readonly placeholder = PLACEHOLDER_IMAGE;
  readonly onImageError = onImageError;
  readonly thumbnails = THUMBNAILS;

  readonly tabs: TabStatus[] = [
    'All',
    'Pending',
    'Processing',
    'Shipped',
    'Delivered',
    'Cancelled',
  ];
  readonly activeTab = signal<TabStatus>('All');
  readonly searchQuery = signal('');
  readonly expanded = signal<ReadonlySet<string>>(new Set());

  /** The signed-in customer's orders, newest first (the service only loads their own). */
  readonly orders = this.orderService.orders;
  readonly loading = this.orderService.loading;
  readonly error = this.orderService.error;

  readonly filteredOrders = computed(() => {
    let list = this.orders();
    const tab = this.activeTab();
    const q = this.searchQuery().trim().toLowerCase();
    if (tab !== 'All') list = list.filter((o) => o.status === tab);
    if (q) {
      list = list.filter(
        (o) =>
          o.code.toLowerCase().includes(q) || o.items.some((i) => i.name.toLowerCase().includes(q)),
      );
    }
    return list;
  });

  countForStatus(status: TabStatus): number {
    const list = this.orders();
    return status === 'All' ? list.length : list.filter((o) => o.status === status).length;
  }

  itemCount(order: Order): number {
    return order.items.reduce((sum, item) => sum + item.qty, 0);
  }

  toggle(id: string): void {
    this.expanded.update((open) => {
      const next = new Set(open);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }
}

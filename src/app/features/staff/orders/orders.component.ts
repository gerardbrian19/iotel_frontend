import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { Order, OrderStatus } from '../../../core/models';
import { ORDER_STATUS_COLORS, paymentBadge, staffAction } from '../../../core/orders/order-view';
import { OrderService } from '../../../core/services/order.service';
import { OrderActionsComponent } from '../../../shared/components/order-actions/order-actions.component';
import { OrderDetailComponent } from '../../../shared/components/order-detail/order-detail.component';
import { PLACEHOLDER_IMAGE, onImageError } from '../../../shared/utils/product-image';

type Tab = 'Pending' | 'Processing' | 'Shipped' | 'All';

@Component({
  selector: 'app-staff-orders',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzCardModule,
    NzCheckboxModule,
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
export class StaffOrdersComponent {
  private readonly orderService = inject(OrderService);

  readonly statusColors = ORDER_STATUS_COLORS;
  readonly paymentBadge = paymentBadge;
  readonly placeholder = PLACEHOLDER_IMAGE;
  readonly onImageError = onImageError;

  readonly orders = this.orderService.orders;
  readonly loading = this.orderService.loading;
  readonly error = this.orderService.error;

  readonly tabs: Tab[] = ['Pending', 'Processing', 'Shipped', 'All'];
  readonly activeTab = signal<Tab>('Pending');
  readonly search = signal('');
  readonly expanded = signal<ReadonlySet<string>>(new Set());
  /** Items ticked off while packing, by order id. Only a reminder for whoever is packing, so it is not saved. */
  readonly packed = signal<Readonly<Record<string, ReadonlySet<string>>>>({});

  /** Queues are worked oldest first; "All" shows the newest first. */
  readonly filtered = computed(() => {
    const tab = this.activeTab();
    const q = this.search().trim().toLowerCase();
    let list =
      tab === 'All'
        ? this.orders()
        : this.orders()
            .filter((o) => o.status === tab)
            .reverse();
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

  tabCount(tab: Tab): number {
    return tab === 'All'
      ? this.orders().length
      : this.orders().filter((o) => o.status === tab).length;
  }

  /** Orders staff have to act on right now (excludes those waiting for the customer). */
  readonly actionable = computed(() => this.orders().filter((o) => staffAction(o) !== null).length);

  needsAction(order: Order): boolean {
    return staffAction(order) !== null;
  }

  toggle(id: string): void {
    this.expanded.update((open) => {
      const next = new Set(open);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  isPacked(order: Order, productId: string): boolean {
    return this.packed()[order.id]?.has(productId) ?? false;
  }

  packedCount(order: Order): number {
    return this.packed()[order.id]?.size ?? 0;
  }

  togglePacked(order: Order, productId: string): void {
    this.packed.update((all) => {
      const next = new Set(all[order.id] ?? []);
      if (!next.delete(productId)) next.add(productId);
      return { ...all, [order.id]: next };
    });
  }

  emptyText(status: OrderStatus | 'All'): string {
    return this.search()
      ? 'No orders match your search'
      : status === 'All'
        ? 'No orders yet'
        : `No ${status.toLowerCase()} orders`;
  }
}

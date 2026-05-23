import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';
import { OrderService } from '../../../core/services/order.service';
import { AuthService } from '../../../core/services/auth.service';
import { Order, OrderStatus } from '../../../core/models';

type TabStatus = 'All' | OrderStatus;

const STATUS_COLORS: Record<OrderStatus, string> = {
  Pending: 'warning',
  Processing: 'processing',
  Shipped: 'blue',
  Delivered: 'success',
  Cancelled: 'error',
};

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [
    RouterLink, CurrencyPipe, DatePipe, FormsModule,
    NzTableModule, NzTagModule, NzInputModule, NzButtonModule,
    NzIconModule, NzEmptyModule, NzCollapseModule,
  ],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrdersComponent {
  private readonly orderService = inject(OrderService);
  private readonly auth = inject(AuthService);

  readonly STATUS_COLORS = STATUS_COLORS;
  readonly tabs: TabStatus[] = ['All', 'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
  readonly activeTab = signal<TabStatus>('All');
  readonly searchQuery = signal('');

  readonly orders = computed(() => {
    const user = this.auth.currentUser();
    return user ? this.orderService.orders().filter(o => o.customerId === user.id) : [];
  });

  readonly filteredOrders = computed(() => {
    let list = this.orders();
    const tab = this.activeTab();
    const q = this.searchQuery().toLowerCase();
    if (tab !== 'All') list = list.filter(o => o.status === tab);
    if (q) list = list.filter(o => o.id.toLowerCase().includes(q) ||
      o.items.some(i => i.name.toLowerCase().includes(q)));
    return list;
  });

  countForStatus(status: TabStatus): number {
    const list = this.orders();
    return status === 'All' ? list.length : list.filter(o => o.status === status).length;
  }
}

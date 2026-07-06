import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { OrderService } from '../../../core/services/order.service';
import { Order, OrderStatus } from '../../../core/models';

type TabStatus = 'All' | OrderStatus;
const STATUS_COLORS: Record<OrderStatus, string> = { Pending: 'warning', Processing: 'processing', Shipped: 'blue', Delivered: 'success', Cancelled: 'error' };

@Component({
  selector: 'app-admin-orders',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, FormsModule, NzTableModule, NzTagModule, NzSelectModule, NzButtonModule, NzInputModule, NzIconModule],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOrdersComponent {
  private readonly orderService = inject(OrderService);
  private readonly msg = inject(NzMessageService);

  readonly STATUS_COLORS = STATUS_COLORS;
  readonly tabs: TabStatus[] = ['All', 'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
  readonly statuses: OrderStatus[] = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
  readonly activeTab = signal<TabStatus>('All');
  readonly search = signal('');
  readonly expandedOrders = signal<Set<string>>(new Set());
  readonly pendingStatus = signal<Record<string, OrderStatus | undefined>>({});

  readonly orders = this.orderService.orders;

  readonly filtered = computed(() => {
    let list = this.orders();
    if (this.activeTab() !== 'All') list = list.filter(o => o.status === this.activeTab());
    const q = this.search().toLowerCase();
    if (q) list = list.filter(o => o.id.toLowerCase().includes(q) || o.address.fullName.toLowerCase().includes(q));
    return list;
  });

  countTab(t: TabStatus) { return t === 'All' ? this.orders().length : this.orders().filter(o => o.status === t).length; }

  toggleExpand(id: string) {
    this.expandedOrders.update(s => {
      const ns = new Set(s);
      ns.has(id) ? ns.delete(id) : ns.add(id);
      return ns;
    });
  }

  setPendingStatus(orderId: string, status: OrderStatus) {
    this.pendingStatus.update(m => ({ ...m, [orderId]: status }));
  }

  updateStatus(order: Order) {
    const newStatus = this.pendingStatus()[order.id];
    if (!newStatus) return;
    this.orderService.updateStatus(order.id, newStatus).subscribe(() => {
      this.msg.success(`Order ${order.id} updated to ${newStatus}`);
      this.pendingStatus.update(m => { const n = { ...m }; delete n[order.id]; return n; });
    });
  }
}

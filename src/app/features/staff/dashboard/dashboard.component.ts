import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { OrderService } from '../../../core/services/order.service';
import { ProductService } from '../../../core/services/product.service';
import { MessageService } from '../../../core/services/message.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-staff-dashboard',
  standalone: true,
  imports: [CurrencyPipe, NzCardModule, NzStatisticModule, NzTagModule, NzAlertModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffDashboardComponent {
  private readonly orderService = inject(OrderService);
  private readonly productService = inject(ProductService);
  private readonly messageService = inject(MessageService);
  private readonly auth = inject(AuthService);

  readonly pendingOrders = computed(() => this.orderService.orders().filter(o => o.status === 'Pending').length);
  readonly processingOrders = computed(() => this.orderService.orders().filter(o => o.status === 'Processing').length);
  readonly lowStock = computed(() => this.productService.products().filter(p => p.stock <= 5).length);
  readonly userId = this.auth.currentUser()?.id ?? 0;
  readonly unreadMessages = computed(() =>
    this.messageService.conversations().reduce((acc, c) => acc + c.unreadCount, 0)
  );
  readonly pendingOrderList = computed(() => this.orderService.orders().filter(o => o.status === 'Pending').slice(0, 5));
  readonly lowStockItems = computed(() => this.productService.products().filter(p => p.stock <= 5));
}

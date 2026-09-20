import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { OrderService } from '../../../core/services/order.service';
import { ProductService } from '../../../core/services/product.service';
import { MessageService } from '../../../core/services/message.service';
import { BookingService } from '../../../core/services/booking.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-staff-dashboard',
  standalone: true,
  imports: [NzCardModule, NzStatisticModule, NzTagModule, NzAlertModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffDashboardComponent {
  private readonly orderService = inject(OrderService);
  private readonly productService = inject(ProductService);
  private readonly messageService = inject(MessageService);
  private readonly bookingService = inject(BookingService);
  private readonly auth = inject(AuthService);

  readonly pendingOrders = computed(() => this.orderService.orders().filter(o => o.status === 'Pending').length);
  readonly processingOrders = computed(() => this.orderService.orders().filter(o => o.status === 'Processing').length);
  private readonly lowStockProducts = computed(() =>
    this.productService.products().filter(p => p.isActive && p.stock <= 5));
  readonly lowStock = computed(() => this.lowStockProducts().length);
  /** New requests to quote, plus payments waiting to be verified. */
  readonly bookingsNeedingAction = computed(
    () => this.bookingService.bookings().filter(b => b.status === 'Pending' || b.payment?.status === 'Submitted' && b.status === 'Confirmed').length,
  );
  readonly userId = this.auth.currentUser()?.id ?? '';
  readonly unreadMessages = computed(() =>
    this.messageService.conversations().reduce((acc, c) => acc + c.unreadCount, 0)
  );
  readonly pendingOrderList = computed(() => this.orderService.orders().filter(o => o.status === 'Pending').slice(0, 5));
  /** The 10 most urgent items (fewest units first); the KPI card shows the full count. */
  readonly lowStockItems = computed(() =>
    [...this.lowStockProducts()].sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name)).slice(0, 10));
  readonly lowStockHidden = computed(() => this.lowStock() - this.lowStockItems().length);
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { formatSlot } from '../../../core/booking/schedule';
import { OrderService } from '../../../core/services/order.service';
import { ProductService } from '../../../core/services/product.service';
import { MessageService } from '../../../core/services/message.service';
import { BookingService, needsStaffAction } from '../../../core/services/booking.service';

@Component({
  selector: 'app-staff-dashboard',
  standalone: true,
  imports: [RouterLink, NzCardModule, NzStatisticModule, NzTagModule, NzAlertModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffDashboardComponent {
  private readonly orderService = inject(OrderService);
  private readonly productService = inject(ProductService);
  private readonly messageService = inject(MessageService);
  private readonly bookingService = inject(BookingService);

  readonly productsLoading = this.productService.loading;
  readonly bookingsLoading = this.bookingService.loading;
  readonly messagesLoading = this.messageService.loading;
  /** Names of the live sources that failed to load, so the KPIs above them aren't silently zero. */
  readonly loadFailures = computed(() =>
    [
      this.productService.error() ? 'products' : null,
      this.bookingService.error() ? 'bookings' : null,
      this.messageService.error() ? 'messages' : null,
    ].filter((name): name is string => name !== null),
  );

  readonly pendingOrders = computed(() => this.orderService.orders().filter(o => o.status === 'Pending').length);
  readonly processingOrders = computed(() => this.orderService.orders().filter(o => o.status === 'Processing').length);
  private readonly lowStockProducts = computed(() =>
    this.productService.products().filter(p => p.isActive && p.stock <= 5));
  readonly lowStock = computed(() => this.lowStockProducts().length);
  /** New requests to quote, plus payments waiting to be verified, soonest appointment first. */
  private readonly bookingsToHandle = computed(() =>
    this.bookingService
      .bookings()
      .filter(needsStaffAction)
      .sort((a, b) =>
        (a.preferredDate + a.preferredTime).localeCompare(b.preferredDate + b.preferredTime)),
  );
  readonly bookingsNeedingAction = computed(() => this.bookingsToHandle().length);
  readonly bookingQueue = computed(() =>
    this.bookingsToHandle().slice(0, 5).map(b => ({
      id: b.id,
      conversationId: b.conversationId,
      title: b.serviceName,
      sub: `${b.customerName} · ${formatSlot(b.preferredDate, b.preferredTime)}`,
      verifyPayment: b.status === 'Confirmed',
    })),
  );
  readonly bookingsHidden = computed(() => this.bookingsNeedingAction() - this.bookingQueue().length);
  readonly unreadMessages = this.messageService.unreadTotal;
  readonly pendingOrderList = computed(() => this.orderService.orders().filter(o => o.status === 'Pending').slice(0, 5));
  /** The 10 most urgent items (fewest units first); the KPI card shows the full count. */
  readonly lowStockItems = computed(() =>
    [...this.lowStockProducts()].sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name)).slice(0, 10));
  readonly lowStockHidden = computed(() => this.lowStock() - this.lowStockItems().length);
}

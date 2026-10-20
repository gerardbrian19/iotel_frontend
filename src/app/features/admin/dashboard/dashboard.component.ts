import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { PRODUCT_CATEGORIES } from '../../../core/models';
import { ProductService } from '../../../core/services/product.service';
import { OrderService } from '../../../core/services/order.service';
import { BookingService } from '../../../core/services/booking.service';
import { ActivityService } from '../../../core/services/activity.service';
import { SALES_PERIODS, SalesPeriod, salesSeries } from '../../../core/orders/sales-view';
import { paymentSummary } from '../../../core/payments/payment-summary';
import { bookingSummary } from '../../../core/booking/booking-summary';
import { activityCategoryView } from '../activity/activity-view';
import { SalesChartComponent } from './sales-chart/sales-chart.component';
import { PaymentsSummaryComponent } from './payments-summary/payments-summary.component';
import { BookingsSummaryComponent } from './bookings-summary/bookings-summary.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    FormsModule,
    RouterLink,
    NzCardModule,
    NzTagModule,
    NzTableModule,
    NzStatisticModule,
    NzBadgeModule,
    NzAlertModule,
    NzIconModule,
    NzRadioModule,
    SalesChartComponent,
    PaymentsSummaryComponent,
    BookingsSummaryComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly productService = inject(ProductService);
  private readonly orderService = inject(OrderService);
  private readonly bookingService = inject(BookingService);
  private readonly activityService = inject(ActivityService);

  readonly products = this.productService.products;
  readonly orders = this.orderService.orders;

  readonly totalProducts = computed(() => this.products().length);
  readonly totalOrders = computed(() => this.orders().length);
  readonly revenue = computed(() =>
    this.orders()
      .filter((o) => o.status === 'Delivered')
      .reduce((s, o) => s + o.total, 0),
  );
  readonly salesPeriods = SALES_PERIODS;
  readonly salesPeriod = signal<SalesPeriod>('month');
  readonly salesPeriodView = computed(
    () => SALES_PERIODS.find((p) => p.value === this.salesPeriod()) ?? SALES_PERIODS[2],
  );
  readonly sales = computed(() => salesSeries(this.orders(), this.salesPeriod()));
  readonly salesTotal = computed(() => this.sales().reduce((s, m) => s + m.total, 0));

  readonly payments = computed(() => paymentSummary(this.orders(), this.bookingService.bookings()));
  readonly bookings = computed(() => bookingSummary(this.bookingService.bookings()));

  readonly recentActivity = computed(() => this.activityService.entries().slice(0, 8));
  readonly activityLoading = this.activityService.loading;
  readonly activityError = this.activityService.error;
  readonly categoryView = activityCategoryView;
  readonly lowStockItems = computed(() =>
    this.products().filter((p) => p.stock > 0 && p.stock <= 5),
  );
  readonly recentOrders = computed(() => [...this.orders()].slice(0, 5));

  readonly statusColors: Record<string, string> = {
    Pending: 'warning',
    Processing: 'processing',
    Shipped: 'blue',
    Delivered: 'success',
    Cancelled: 'error',
  };

  readonly categoryStats = computed(() => {
    return PRODUCT_CATEGORIES.map((cat) => {
      const items = this.products().filter((p) => p.category === cat);
      return {
        category: cat,
        count: items.length,
        totalUnits: items.reduce((s, p) => s + p.stock, 0),
        stockValue: items.reduce((s, p) => s + p.stock * (p.price ?? 0), 0),
      };
    });
  });

  readonly statusCounts = computed(() => {
    const orders = this.orders();
    return {
      Pending: orders.filter((o) => o.status === 'Pending').length,
      Processing: orders.filter((o) => o.status === 'Processing').length,
      Shipped: orders.filter((o) => o.status === 'Shipped').length,
      Delivered: orders.filter((o) => o.status === 'Delivered').length,
      Cancelled: orders.filter((o) => o.status === 'Cancelled').length,
    };
  });
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { PRODUCT_CATEGORIES } from '../../../core/models';
import { ProductService } from '../../../core/services/product.service';
import { OrderService } from '../../../core/services/order.service';
import { monthlySales } from '../../../core/orders/sales-view';
import { SalesChartComponent } from './sales-chart/sales-chart.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, RouterLink, NzCardModule, NzTagModule, NzTableModule, NzStatisticModule, NzBadgeModule, NzAlertModule, NzIconModule, SalesChartComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly productService = inject(ProductService);
  private readonly orderService = inject(OrderService);

  readonly products = this.productService.products;
  readonly orders = this.orderService.orders;

  readonly totalProducts = computed(() => this.products().length);
  readonly totalOrders = computed(() => this.orders().length);
  readonly revenue = computed(() =>
    this.orders().filter(o => o.status === 'Delivered').reduce((s, o) => s + o.total, 0)
  );
  readonly monthlySales = computed(() => monthlySales(this.orders()));
  readonly salesTotal = computed(() => this.monthlySales().reduce((s, m) => s + m.total, 0));
  readonly lowStockItems =computed(() => this.products().filter(p => p.stock > 0 && p.stock <= 5));
  readonly recentOrders = computed(() => [...this.orders()].slice(0, 5));

  readonly statusColors: Record<string, string> = {
    Pending: 'warning', Processing: 'processing', Shipped: 'blue',
    Delivered: 'success', Cancelled: 'error',
  };

  readonly categoryStats = computed(() => {
    return PRODUCT_CATEGORIES.map(cat => {
      const items = this.products().filter(p => p.category === cat);
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
      Pending: orders.filter(o => o.status === 'Pending').length,
      Processing: orders.filter(o => o.status === 'Processing').length,
      Shipped: orders.filter(o => o.status === 'Shipped').length,
      Delivered: orders.filter(o => o.status === 'Delivered').length,
      Cancelled: orders.filter(o => o.status === 'Cancelled').length,
    };
  });
}

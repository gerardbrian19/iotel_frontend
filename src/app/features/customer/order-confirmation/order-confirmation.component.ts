import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzResultModule } from 'ng-zorro-antd/result';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { ORDER_STATUS_COLORS } from '../../../core/orders/order-view';
import { OrderService } from '../../../core/services/order.service';
import { OrderActionsComponent } from '../../../shared/components/order-actions/order-actions.component';
import { OrderDetailComponent } from '../../../shared/components/order-detail/order-detail.component';

/** Where checkout lands, and a live view of a single order (its status follows staff's updates as they happen). */
@Component({
  selector: 'app-order-confirmation',
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
    NzButtonModule,
    NzCardModule,
    NzIconModule,
    NzResultModule,
    NzSpinModule,
    NzTagModule,
    OrderActionsComponent,
    OrderDetailComponent,
  ],
  templateUrl: './order-confirmation.component.html',
  styleUrl: './order-confirmation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderConfirmationComponent {
  private readonly orders = inject(OrderService);

  readonly id = input.required<string>();
  readonly order = computed(() => this.orders.byId().get(this.id()));
  readonly statusColors = ORDER_STATUS_COLORS;

  private readonly graceOver = signal(false);
  /**
   * Right after checkout the new order can take a moment to reach the live list (transactions aren't applied locally
   * first), so "not found" only shows once the list has loaded and a few seconds have passed.
   */
  readonly loading = computed(() => this.orders.loading() || !this.graceOver());

  constructor() {
    const timer = setTimeout(() => this.graceOver.set(true), 3000);
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }
}

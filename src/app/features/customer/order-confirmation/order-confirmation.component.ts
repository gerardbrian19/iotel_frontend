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
import { NzResultStatusType } from 'ng-zorro-antd/result';
import { ORDER_STATUS_COLORS } from '../../../core/orders/order-view';
import { OrderService } from '../../../core/services/order.service';
import { OrderActionsComponent } from '../../../shared/components/order-actions/order-actions.component';
import { OrderDetailComponent } from '../../../shared/components/order-detail/order-detail.component';

/**
 * Where PayMongo sends the customer back to (`?payment=success|cancelled`), and a live view of a single order: the
 * payment flips to Paid as soon as PayMongo's webhook arrives, and the status follows staff's updates.
 */
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
  /** `success` or `cancelled` when PayMongo sends the customer back here. */
  readonly payment = input<string>();
  readonly order = computed(() => this.orders.byId().get(this.id()));

  readonly result = computed((): { status: NzResultStatusType; title: string } | null => {
    const order = this.order();
    if (!order) return null;
    if (order.status === 'Cancelled') return { status: 'info', title: 'Order Cancelled' };
    if (order.status !== 'Pending') return { status: 'success', title: `Order ${order.status}` };
    if (order.payment.status === 'Paid') return { status: 'success', title: 'Payment received!' };
    return this.payment() === 'success'
      ? { status: 'info', title: 'Confirming your payment…' }
      : { status: 'warning', title: 'Waiting for your payment' };
  });
  /** Back from a completed PayMongo checkout, before its webhook has reached us (usually a few seconds). */
  readonly confirming = computed(
    () => this.payment() === 'success' && this.order()?.payment.status === 'Unpaid',
  );
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

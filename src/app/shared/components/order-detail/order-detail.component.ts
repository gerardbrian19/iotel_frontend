import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { orderTimeline, paymentBadge } from '../../../core/orders/order-view';
import { Order } from '../../../core/models';
import { PLACEHOLDER_IMAGE, onImageError } from '../../utils/product-image';

/**
 * Everything about one order, read-only: its items and totals, a progress tracker, the payment, the delivery address
 * and the shipment. Shared by the customer's order pages and the staff and admin order screens.
 */
@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, NzTagModule],
  templateUrl: './order-detail.component.html',
  styleUrl: './order-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderDetailComponent {
  readonly order = input.required<Order>();
  /** Shows who ordered, with their contact details (for staff and admins). */
  readonly showCustomer = input(false);

  readonly placeholder = PLACEHOLDER_IMAGE;
  readonly onImageError = onImageError;
  readonly timeline = computed(() => orderTimeline(this.order()));
  readonly payment = computed(() => paymentBadge(this.order()));
}

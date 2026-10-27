import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { orderTimeline, paymentBadge } from '../../../core/orders/order-view';
import { Order } from '../../../core/models';
import {
  PAYMENT_PROVIDER_LABELS,
  paymentMethodLabel,
} from '../../../core/payments/payment-methods';
import { PLACEHOLDER_IMAGE, onImageError } from '../../utils/product-image';
import { StorageImageComponent } from '../storage-image/storage-image.component';

/**
 * Everything about one order, read-only: its items and totals, a progress tracker, the payment, the delivery address
 * and the shipment. Shared by the customer's order pages and the staff and admin order screens.
 */
@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, NzTagModule, StorageImageComponent],
  templateUrl: './order-detail.component.html',
  styleUrl: './order-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderDetailComponent {
  readonly order = input.required<Order>();
  /** Shows who ordered, with their contact details, and the payment id or reference (for staff and admins). */
  readonly showCustomer = input(false);

  readonly placeholder = PLACEHOLDER_IMAGE;
  readonly onImageError = onImageError;
  readonly timeline = computed(() => orderTimeline(this.order()));
  readonly payment = computed(() => paymentBadge(this.order()));
  readonly method = computed(() => paymentMethodLabel(this.order().payment.method));
  readonly provider = computed(() => PAYMENT_PROVIDER_LABELS[this.order().payment.provider]);
  /** What staff look the payment up by: PayMongo's payment id, or the transfer's reference number. */
  readonly paymentIdLabel = computed(() =>
    this.order().payment.provider === 'paymongo' ? 'PayMongo payment' : 'Reference no.',
  );
}

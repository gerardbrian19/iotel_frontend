import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import {
  ACCEPTED_PAYMENT_METHODS,
  UNPAID_ORDER_MINUTES,
} from '../../../core/payments/payment-methods';
import { AddressService } from '../../../core/services/address.service';
import { CartService } from '../../../core/services/cart.service';
import { OrderService, orderErrorMessage } from '../../../core/services/order.service';
import { PLACEHOLDER_IMAGE, onImageError } from '../../../shared/utils/product-image';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [
    RouterLink,
    CurrencyPipe,
    NzAlertModule,
    NzButtonModule,
    NzCardModule,
    NzDividerModule,
    NzEmptyModule,
    NzIconModule,
  ],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutComponent {
  private readonly cart = inject(CartService);
  private readonly orders = inject(OrderService);
  private readonly addresses = inject(AddressService);
  private readonly msg = inject(NzMessageService);

  readonly items = this.cart.items;
  readonly subtotal = computed(() => this.cart.subtotal);
  readonly shippingFee = computed(() => this.cart.shippingFee);
  readonly total = computed(() => this.cart.total);

  /** Lines that can't be bought as they are (out of stock, not enough stock, price changed); see `CartService`. */
  readonly problems = this.cart.problems;
  readonly problemByProduct = computed(
    () => new Map(this.problems().map((p) => [p.productId, p.message])),
  );

  readonly acceptedMethods = ACCEPTED_PAYMENT_METHODS;
  readonly unpaidMinutes = UNPAID_ORDER_MINUTES;
  /** True from the click until the browser has left for PayMongo (or the request failed). */
  readonly placing = signal(false);

  /** Ships to the customer's default saved address; they change it on the addresses page. */
  readonly address = this.addresses.defaultAddress;
  readonly addressLoading = this.addresses.loading;

  readonly canPlace = computed(
    () =>
      !this.placing() &&
      this.items().length > 0 &&
      this.problems().length === 0 &&
      !!this.address(),
  );

  readonly placeholder = PLACEHOLDER_IMAGE;
  readonly onImageError = onImageError;

  fixCart(): void {
    this.cart.fitToStock();
  }

  /** Creates the order on the backend and hands the customer over to PayMongo's checkout page. */
  placeOrder(): void {
    const saved = this.address();
    if (!this.canPlace() || !saved) return;
    this.placing.set(true);
    // The order keeps a snapshot of the shipping details only, so later edits to the saved address don't alter it.
    const { fullName, addressLine, city, province, zip, mobile } = saved;
    this.orders
      .checkout({
        items: this.items(),
        address: { fullName, addressLine, city, province, zip, mobile },
      })
      .subscribe({
        next: ({ checkoutUrl }) => {
          // The order exists now; if the customer comes back without paying, it waits on their Orders page.
          this.cart.clear();
          window.location.assign(checkoutUrl);
        },
        error: (err) => {
          this.placing.set(false);
          this.msg.error(orderErrorMessage(err));
        },
      });
  }
}

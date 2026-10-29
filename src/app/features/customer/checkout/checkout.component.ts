import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import {
  ACCEPTED_PAYMENT_METHODS,
  UNPAID_ORDER_MINUTES,
} from '../../../core/payments/payment-methods';
import { receiverLabel } from '../../../core/payments/manual-payments';
import { AddressService } from '../../../core/services/address.service';
import { CartService } from '../../../core/services/cart.service';
import { OrderService, PlaceOrder, orderErrorMessage } from '../../../core/services/order.service';
import { PaymentReceiverService } from '../../../core/services/payment-receiver.service';
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
    NzModalModule,
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
  private readonly modal = inject(NzModalService);
  private readonly router = inject(Router);
  private readonly receivers = inject(PaymentReceiverService);

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
  /** True from the click until the browser has left for PayMongo or the order page (or the request failed). */
  readonly placing = signal(false);

  /** PayMongo's checkout, or a bank / GCash transfer the customer sends proof of from the order page. */
  readonly provider = signal<PlaceOrder['provider']>('paymongo');
  /** Transfers are offered once an admin has added an account to pay into. */
  readonly transferReceivers = this.receivers.activeReceivers;
  readonly transferNames = computed(() =>
    [...new Set(this.transferReceivers().map((r) => receiverLabel(r)))].join(', '),
  );

  /** Ships to the customer's default saved address; they change it on the addresses page. */
  readonly address = this.addresses.defaultAddress;
  readonly addressLoading = this.addresses.loading;

  /** Everything but the address is ready. The Pay button stays clickable then, to explain the missing address. */
  readonly readyButAddress = computed(
    () =>
      !this.placing() &&
      this.items().length > 0 &&
      this.problems().length === 0 &&
      (this.provider() === 'paymongo' || this.transferReceivers().length > 0),
  );
  readonly canPlace = computed(() => this.readyButAddress() && !!this.address());

  readonly placeholder = PLACEHOLDER_IMAGE;
  readonly onImageError = onImageError;

  private askForAddress(): void {
    this.modal.confirm({
      nzTitle: 'Please add your shipping address',
      nzContent:
        'We need to know where to deliver your order before you can pay. Add an address, then come back to checkout.',
      nzOkText: 'Add address',
      nzCancelText: 'Not now',
      nzOnOk: () =>
        void this.router.navigate(['/customer/addresses'], {
          queryParams: { add: 1, from: 'checkout' },
        }),
    });
  }

  fixCart(): void {
    this.cart.fitToStock();
  }

  /**
   * Creates the order on the backend, then hands the customer over to PayMongo's checkout page, or, for a transfer,
   * to the order page where they find the accounts and send the proof.
   */
  placeOrder(): void {
    const saved = this.address();
    if (!saved && !this.addressLoading()) {
      this.askForAddress();
      return;
    }
    if (!this.canPlace() || !saved) return;
    this.placing.set(true);
    // The order keeps a snapshot of the shipping details only, so later edits to the saved address don't alter it.
    const { fullName, addressLine, city, province, zip, mobile } = saved;
    this.orders
      .checkout({
        items: this.items(),
        address: { fullName, addressLine, city, province, zip, mobile },
        provider: this.provider(),
      })
      .subscribe({
        next: ({ orderId, checkoutUrl }) => {
          // The order exists now; if the customer comes back without paying, it waits on their Orders page.
          this.cart.clear();
          if (checkoutUrl) window.location.assign(checkoutUrl);
          else this.router.navigate(['/customer/orders', orderId, 'confirmation']);
        },
        error: (err) => {
          this.placing.set(false);
          this.msg.error(orderErrorMessage(err));
        },
      });
  }
}

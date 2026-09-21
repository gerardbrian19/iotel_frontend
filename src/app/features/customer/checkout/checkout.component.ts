import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { PaymentMethod } from '../../../core/models';
import {
  PAYMENT_OPTIONS,
  paymentOption,
  referenceError,
} from '../../../core/payments/payment-methods';
import { AddressService } from '../../../core/services/address.service';
import { AuthService } from '../../../core/services/auth.service';
import { CartService } from '../../../core/services/cart.service';
import { OrderService, orderErrorMessage } from '../../../core/services/order.service';
import { PLACEHOLDER_IMAGE, onImageError } from '../../../shared/utils/product-image';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [
    RouterLink,
    CurrencyPipe,
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzCardModule,
    NzDividerModule,
    NzEmptyModule,
    NzIconModule,
    NzInputModule,
  ],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutComponent {
  private readonly cart = inject(CartService);
  private readonly orders = inject(OrderService);
  private readonly auth = inject(AuthService);
  private readonly addresses = inject(AddressService);
  private readonly router = inject(Router);
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

  readonly paymentOptions = PAYMENT_OPTIONS;
  readonly method = signal<PaymentMethod | null>(null);
  readonly reference = signal('');
  readonly placing = signal(false);

  /** Ships to the customer's default saved address; they change it on the addresses page. */
  readonly address = this.addresses.defaultAddress;
  readonly addressLoading = this.addresses.loading;

  readonly needsReference = computed(() => {
    const method = this.method();
    return method !== null && paymentOption(method).needsReference;
  });
  /** Shown once the customer has typed something, so the field isn't flagged before they get to it. */
  readonly referenceProblem = computed(() =>
    this.needsReference() && this.reference() ? referenceError(this.reference()) : null,
  );
  readonly canPlace = computed(
    () =>
      !this.placing() &&
      this.items().length > 0 &&
      this.problems().length === 0 &&
      !!this.address() &&
      this.method() !== null &&
      (!this.needsReference() || referenceError(this.reference()) === null),
  );

  readonly placeholder = PLACEHOLDER_IMAGE;
  readonly onImageError = onImageError;

  selectMethod(method: PaymentMethod): void {
    this.method.set(method);
  }

  fixCart(): void {
    this.cart.fitToStock();
  }

  placeOrder(): void {
    const saved = this.address();
    const method = this.method();
    if (!this.canPlace() || !saved || !method) return;
    this.placing.set(true);
    // The order keeps a snapshot of the shipping details only, so later edits to the saved address don't alter it.
    const { fullName, addressLine, city, province, zip, mobile } = saved;
    this.orders
      .place({
        items: this.items(),
        address: { fullName, addressLine, city, province, zip, mobile },
        method,
        referenceNumber: this.needsReference() ? this.reference() : undefined,
      })
      .pipe(finalize(() => this.placing.set(false)))
      .subscribe({
        next: (id) => {
          this.cart.clear();
          this.router.navigate(['/customer/orders', id, 'confirmation']);
        },
        error: (err) => this.msg.error(orderErrorMessage(err)),
      });
  }
}

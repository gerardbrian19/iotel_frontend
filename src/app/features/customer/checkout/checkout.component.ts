import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzStepsModule } from 'ng-zorro-antd/steps';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { FormsModule } from '@angular/forms';
import { CartService } from '../../../core/services/cart.service';
import { OrderService } from '../../../core/services/order.service';
import { AddressService } from '../../../core/services/address.service';
import { AuthService } from '../../../core/services/auth.service';
import { PaymentMethod } from '../../../core/models';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [
    RouterLink,
    CurrencyPipe,
    FormsModule,
    ReactiveFormsModule,
    NzStepsModule,
    NzCardModule,
    NzButtonModule,
    NzIconModule,
    NzModalModule,
    NzFormModule,
    NzInputModule,
    NzRadioModule,
    NzDividerModule,
    NzTagModule,
  ],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutComponent {
  private readonly cart = inject(CartService);
  private readonly orderService = inject(OrderService);
  private readonly auth = inject(AuthService);
  private readonly addresses = inject(AddressService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly items = this.cart.items;
  readonly subtotal = computed(() => this.cart.subtotal);
  readonly shippingFee = computed(() => this.cart.shippingFee);
  readonly total = computed(() => this.cart.total);

  readonly selectedPayment = signal<PaymentMethod | null>(null);
  readonly referenceNumber = signal('');
  readonly paymentModalVisible = signal(false);
  /** Ships to the customer's default saved address; they change it on the addresses page. */
  readonly address = this.addresses.defaultAddress;
  readonly addressLoading = this.addresses.loading;

  openPaymentModal(): void {
    this.paymentModalVisible.set(true);
  }

  selectPayment(method: PaymentMethod): void {
    this.selectedPayment.set(method);
  }

  placeOrder(): void {
    const user = this.auth.currentUser();
    const saved = this.address();
    if (!user || !saved || !this.selectedPayment()) return;
    // The order keeps a snapshot of the shipping details only, so later edits to the saved address don't alter it.
    const { fullName, addressLine, city, province, zip, mobile } = saved;
    this.orderService
      .createOrder(
        user.id,
        this.items(),
        { fullName, addressLine, city, province, zip, mobile },
        this.selectedPayment()!,
        this.referenceNumber() || undefined,
        this.subtotal(),
        this.shippingFee(),
      )
      .subscribe(order => {
        this.cart.clear();
        this.paymentModalVisible.set(false);
        this.router.navigate([`/customer/orders/${order.id}/confirmation`]);
      });
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, finalize } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { Order } from '../../../core/models';
import {
  canPay,
  canRefund,
  customerCanCancel,
  orderHint,
  staffAction,
} from '../../../core/orders/order-view';
import { AuthService } from '../../../core/services/auth.service';
import { OrderService, orderErrorMessage } from '../../../core/services/order.service';

/**
 * What happens next with an order, and the actions that fit the viewer and the order's status:
 *
 * - Customer: pay through PayMongo, cancel until the order is paid.
 * - Staff / admin: start processing a paid order (takes the items out of stock), mark shipped with the courier, mark
 *   delivered, cancel an unpaid order, refund a paid one (which cancels it).
 *
 * Used on the customer's order pages and the staff and admin order screens.
 */
@Component({
  selector: 'app-order-actions',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    NzButtonModule,
    NzFormModule,
    NzInputModule,
    NzModalModule,
  ],
  templateUrl: './order-actions.component.html',
  styleUrl: './order-actions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderActionsComponent {
  private readonly orders = inject(OrderService);
  private readonly auth = inject(AuthService);
  private readonly msg = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  private readonly fb = inject(FormBuilder);

  readonly order = input.required<Order>();

  readonly busy = signal(false);
  readonly shipVisible = signal(false);
  readonly cancelVisible = signal(false);
  readonly refundVisible = signal(false);

  readonly cancelReason = signal('');
  readonly refundReason = signal('');

  readonly shipForm = this.fb.nonNullable.group({
    courier: ['', [Validators.required, Validators.maxLength(60)]],
    trackingNumber: ['', Validators.maxLength(60)],
  });

  readonly isStaff = computed(() => (this.auth.currentUser()?.role ?? 'customer') !== 'customer');
  readonly hint = computed(() => orderHint(this.order(), this.isStaff()));
  readonly step = computed(() => staffAction(this.order()));
  /** The customer's PayMongo checkout is still open. */
  readonly canPay = computed(() => !this.isStaff() && canPay(this.order()));
  /** Unpaid orders only; paid ones are cancelled by refunding them. */
  readonly canCancel = computed(() => customerCanCancel(this.order()));
  readonly canRefund = computed(() => this.isStaff() && canRefund(this.order()));
  /** Refunding cancels the order too, unless it already is. */
  readonly refundCancels = computed(() => this.order().status !== 'Cancelled');
  /** Refunding a processing order returns its items to stock. */
  readonly restocks = computed(() => this.order().status === 'Processing');

  startProcessing(): void {
    this.run(
      this.orders.startProcessing(this.order()),
      'Order is now being processed. Its items were taken out of stock.',
    );
  }

  openShip(): void {
    this.shipForm.reset({ courier: '', trackingNumber: '' });
    this.shipVisible.set(true);
  }

  ship(): void {
    if (this.shipForm.invalid) return;
    const { courier, trackingNumber } = this.shipForm.getRawValue();
    this.run(
      this.orders.ship(this.order(), courier, trackingNumber),
      'Order marked as shipped.',
      () => this.shipVisible.set(false),
    );
  }

  confirmDelivered(): void {
    this.modal.confirm({
      nzTitle: 'Mark as delivered?',
      nzContent: 'The customer has received the parcel.',
      nzOkText: 'Mark delivered',
      nzCancelText: 'Not yet',
      nzOnOk: () => this.run(this.orders.markDelivered(this.order()), 'Order marked as delivered.'),
    });
  }

  openCancel(): void {
    this.cancelReason.set('');
    this.cancelVisible.set(true);
  }

  cancel(): void {
    this.run(this.orders.cancel(this.order(), this.cancelReason()), 'Order cancelled.', () =>
      this.cancelVisible.set(false),
    );
  }

  /** Back to the PayMongo checkout that was opened for this order. */
  pay(): void {
    const url = this.order().payment.checkoutUrl;
    if (url) window.location.assign(url);
  }

  openRefund(): void {
    this.refundReason.set('');
    this.refundVisible.set(true);
  }

  refund(): void {
    this.run(
      this.orders.refund(this.order(), this.refundReason()),
      this.refundCancels() ? 'Order cancelled and payment refunded.' : 'Payment refunded.',
      () => this.refundVisible.set(false),
    );
  }

  private run(request: Observable<unknown>, success: string, done?: () => void): void {
    this.busy.set(true);
    request.pipe(finalize(() => this.busy.set(false))).subscribe({
      next: () => {
        this.msg.success(success);
        done?.();
      },
      error: (err) => this.msg.error(orderErrorMessage(err)),
    });
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, finalize } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { Order } from '../../../core/models';
import { customerCanCancel, orderHint, staffAction } from '../../../core/orders/order-view';
import { referenceError } from '../../../core/payments/payment-methods';
import { AuthService } from '../../../core/services/auth.service';
import { OrderService, orderErrorMessage } from '../../../core/services/order.service';

/**
 * What happens next with an order, and the actions that fit the viewer and the order's status:
 *
 * - Customer: cancel until the payment is verified, send the payment reference again after a rejected payment.
 * - Staff / admin: verify or reject the payment, start processing (takes the items out of stock), mark shipped with the
 *   courier, mark delivered, cancel.
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
  readonly rejectVisible = signal(false);
  readonly cancelVisible = signal(false);
  readonly payVisible = signal(false);

  readonly rejectReason = signal('');
  readonly cancelReason = signal('');
  readonly reference = signal('');

  readonly shipForm = this.fb.nonNullable.group({
    courier: ['', [Validators.required, Validators.maxLength(60)]],
    trackingNumber: ['', Validators.maxLength(60)],
  });

  readonly isStaff = computed(() => (this.auth.currentUser()?.role ?? 'customer') !== 'customer');
  readonly hint = computed(() => orderHint(this.order(), this.isStaff()));
  readonly step = computed(() => staffAction(this.order()));
  readonly canResubmit = computed(() => {
    const o = this.order();
    return !this.isStaff() && o.status === 'Pending' && o.payment.status === 'Rejected';
  });
  readonly canCancel = computed(() => {
    const o = this.order();
    return this.isStaff()
      ? o.status === 'Pending' || o.status === 'Processing'
      : customerCanCancel(o);
  });
  /** Shown while typing, so the field isn't flagged before the customer has entered anything. */
  readonly referenceProblem = computed(() =>
    this.reference() ? referenceError(this.reference()) : null,
  );
  /** Cancelling a processing order returns its items to stock. */
  readonly restocks = computed(() => this.isStaff() && this.order().status === 'Processing');

  verifyPayment(): void {
    this.run(this.orders.verifyPayment(this.order()), 'Payment verified.');
  }

  openReject(): void {
    this.rejectReason.set('');
    this.rejectVisible.set(true);
  }

  rejectPayment(): void {
    this.run(
      this.orders.rejectPayment(this.order(), this.rejectReason()),
      'Payment rejected. The customer can submit it again.',
      () => this.rejectVisible.set(false),
    );
  }

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
      nzContent:
        this.order().payment.method === 'Cash on Delivery'
          ? 'The customer has the parcel and paid in cash, so the payment is marked as paid too.'
          : 'The customer has received the parcel.',
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

  openPay(): void {
    this.reference.set('');
    this.payVisible.set(true);
  }

  submitPayment(): void {
    if (referenceError(this.reference())) return;
    this.run(
      this.orders.submitPayment(this.order(), this.reference()),
      'Payment reference sent. We will verify it shortly.',
      () => this.payVisible.set(false),
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

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
  canSubmitProof,
  customerCanCancel,
  orderHint,
  staffAction,
} from '../../../core/orders/order-view';
import { proofUnderReview } from '../../../core/payments/manual-payments';
import { AuthService } from '../../../core/services/auth.service';
import { OrderService, orderErrorMessage } from '../../../core/services/order.service';
import { requiredTrimmed } from '../../utils/validators';
import { ManualPaymentPanelComponent } from '../manual-payment-panel/manual-payment-panel.component';
import { PaymentProofComponent } from '../payment-proof/payment-proof.component';

/**
 * What happens next with an order, and the actions that fit the viewer and the order's status:
 *
 * - Customer: pay through PayMongo (or send the proof of a bank / GCash transfer), cancel until the order is paid.
 * - Staff / admin: approve or reject a transfer, start processing a paid order (takes the items out of stock), mark shipped with the courier, mark
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
    ManualPaymentPanelComponent,
    PaymentProofComponent,
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
  readonly refundReference = signal('');

  readonly shipForm = this.fb.nonNullable.group({
    courier: ['', [requiredTrimmed, Validators.maxLength(60)]],
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
  /** The customer still has to send the transfer proof, or is waiting for it to be checked. */
  readonly showTransferPanel = computed(
    () =>
      !this.isStaff() && (canSubmitProof(this.order()) || proofUnderReview(this.order().payment)),
  );
  /** Staff see what the customer sent for a transfer. */
  readonly showProof = computed(() => this.isStaff() && !!this.order().payment.manual?.proofPath);
  /** Transfers are refunded by staff sending the money back themselves, not through PayMongo. */
  readonly manualRefund = computed(() => this.order().payment.provider !== 'paymongo');
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
    this.refundReference.set('');
    this.refundVisible.set(true);
  }

  refund(): void {
    if (this.manualRefund() && !this.refundReference().trim()) return;
    this.run(
      this.orders.refund(this.order(), this.refundReason(), this.refundReference()),
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

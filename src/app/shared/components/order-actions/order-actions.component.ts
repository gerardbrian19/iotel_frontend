import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, finalize } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { CANCEL_REQUEST_REASONS, CancelRequestReason, Order } from '../../../core/models';
import {
  canPay,
  canRefund,
  canRequestCancel,
  canSubmitProof,
  hasOpenCancelRequest,
  customerCanCancel,
  deliveryAddress,
  orderHint,
  staffAction,
} from '../../../core/orders/order-view';
import { proofUnderReview } from '../../../core/payments/manual-payments';
import { AuthService } from '../../../core/services/auth.service';
import { OrderService, orderErrorMessage } from '../../../core/services/order.service';
import { requiredTrimmed } from '../../utils/validators';
import { InvoiceStatusComponent } from '../invoice-status/invoice-status.component';
import { OrderReviewsComponent } from '../order-reviews/order-reviews.component';
import { ManualPaymentPanelComponent } from '../manual-payment-panel/manual-payment-panel.component';
import { PaymentProofComponent } from '../payment-proof/payment-proof.component';

/**
 * What happens next with an order, and the actions that fit the viewer and the order's status:
 *
 * - Customer: pay through PayMongo (or send the proof of a bank / GCash transfer), cancel until the order is paid,
 *   then ask to cancel it (reason + explanation) until it ships.
 * - Staff / admin: approve or reject a transfer, start processing a paid order (takes the items out of stock), mark shipped with the courier, mark
 *   out for delivery, mark delivered, cancel an unpaid order, refund a paid one (which cancels it), approve (refund) or reject a customer's
 *   cancellation request.
 *
 * Used on the customer's order pages and the staff and admin order screens.
 */
const REQUEST_DETAILS_MIN = 10;

@Component({
  selector: 'app-order-actions',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    ReactiveFormsModule,
    NzButtonModule,
    NzFormModule,
    NzInputModule,
    NzModalModule,
    NzRadioModule,
    NzTagModule,
    InvoiceStatusComponent,
    ManualPaymentPanelComponent,
    OrderReviewsComponent,
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

  readonly requestVisible = signal(false);
  readonly requestReason = signal<CancelRequestReason | null>(null);
  readonly requestDetails = signal('');
  readonly rejectVisible = signal(false);
  readonly rejectNote = signal('');

  readonly reasons = Object.entries(CANCEL_REQUEST_REASONS) as [CancelRequestReason, string][];
  readonly reasonLabels: Record<string, string> = CANCEL_REQUEST_REASONS;
  readonly detailsMin = REQUEST_DETAILS_MIN;

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
  /** An open request is approved by refunding, so the plain refund button steps aside meanwhile. */
  readonly canRefund = computed(
    () => this.isStaff() && canRefund(this.order()) && !hasOpenCancelRequest(this.order()),
  );
  /** Customers rate the products of a delivered order. */
  readonly canRate = computed(() => !this.isStaff() && this.order().status === 'Delivered');
  readonly canRequestCancel = computed(() => !this.isStaff() && canRequestCancel(this.order()));
  readonly cancelRequest = computed(() => this.order().cancelRequest);
  readonly requestOpen = computed(() => hasOpenCancelRequest(this.order()));
  readonly requestValid = computed(
    () => !!this.requestReason() && this.requestDetails().trim().length >= REQUEST_DETAILS_MIN,
  );
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

  confirmOutForDelivery(): void {
    this.modal.confirm({
      nzTitle: 'Mark as out for delivery?',
      nzContent: `The customer is told their order is out for delivery to ${deliveryAddress(this.order())}.`,
      nzOkText: 'Out for delivery',
      nzCancelText: 'Not yet',
      nzOnOk: () =>
        this.run(this.orders.markOutForDelivery(this.order()), 'Order is out for delivery.'),
    });
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

  openRequestCancel(): void {
    this.requestReason.set(null);
    this.requestDetails.set('');
    this.requestVisible.set(true);
  }

  submitRequestCancel(): void {
    const reason = this.requestReason();
    if (!reason || !this.requestValid()) return;
    this.run(
      this.orders.requestCancellation(this.order(), reason, this.requestDetails()),
      'Cancellation requested. We will review it and refund you if it is approved.',
      () => this.requestVisible.set(false),
    );
  }

  /** Approving a request is refunding the order, with the customer's reason as the note. */
  approveRequest(): void {
    const request = this.cancelRequest();
    this.openRefund();
    if (request)
      this.refundReason.set(`Cancelled at your request: ${this.reasonLabels[request.reason]}`);
  }

  openReject(): void {
    this.rejectNote.set('');
    this.rejectVisible.set(true);
  }

  reject(): void {
    if (!this.rejectNote().trim()) return;
    this.run(
      this.orders.rejectCancellation(this.order(), this.rejectNote()),
      'Cancellation request rejected. The customer can see why.',
      () => this.rejectVisible.set(false),
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

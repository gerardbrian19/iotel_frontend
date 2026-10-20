import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, finalize } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { Payment } from '../../../core/models';
import { proofUnderReview, receiverTitle } from '../../../core/payments/manual-payments';
import { ManualPaymentService, PaymentKind } from '../../../core/services/manual-payment.service';
import { orderErrorMessage } from '../../../core/services/order.service';
import { StorageImageComponent } from '../storage-image/storage-image.component';

/** Reasons staff pick most often when a transfer can't be verified. */
const REJECT_REASONS = [
  'We could not find this transfer in our account.',
  'The amount received is different from the amount due.',
  'The reference number does not match the screenshot.',
  'The screenshot is unclear.',
];

/**
 * Staff side of a GCash / bank transfer: what the customer says they sent (screenshot, reference number, amount, the
 * account), any earlier rejected attempts, and, while it waits for review, Approve and Reject. Shown in the order
 * actions, the booking panel and the payments queue.
 */
@Component({
  selector: 'app-payment-proof',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    FormsModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzModalModule,
    StorageImageComponent,
  ],
  templateUrl: './payment-proof.component.html',
  styleUrl: './payment-proof.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentProofComponent {
  private readonly manual = inject(ManualPaymentService);
  private readonly msg = inject(NzMessageService);
  private readonly modal = inject(NzModalService);

  readonly kind = input.required<PaymentKind>();
  readonly targetId = input.required<string>();
  readonly payment = input.required<Payment>();
  /** Order number or booking label, for the confirmation dialog. */
  readonly label = input('');

  readonly busy = signal(false);
  readonly rejectVisible = signal(false);
  readonly rejectReason = signal('');
  readonly reasons = REJECT_REASONS;

  readonly proof = computed(() => this.payment().manual);
  readonly pending = computed(() => proofUnderReview(this.payment()));
  readonly differs = computed(() => {
    const sent = this.proof()?.amountSent ?? 0;
    return Math.abs(sent - this.payment().amount) > 0.009;
  });
  readonly receiverTitle = receiverTitle;

  approve(): void {
    const proof = this.proof();
    this.modal.confirm({
      nzTitle: 'Approve this payment?',
      nzContent: `Only approve once you see ${proof?.amountSent?.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })} (ref ${proof?.referenceNumber}) in the ${proof?.receiver ? receiverTitle(proof.receiver) : ''} account. ${this.label()} is then marked paid.`,
      nzOkText: 'Approve',
      nzCancelText: 'Not yet',
      nzOnOk: () =>
        this.run(this.manual.approve(this.kind(), this.targetId()), 'Payment approved.'),
    });
  }

  openReject(): void {
    this.rejectReason.set('');
    this.rejectVisible.set(true);
  }

  reject(): void {
    const reason = this.rejectReason().trim();
    if (!reason) return;
    this.run(
      this.manual.reject(this.kind(), this.targetId(), reason),
      'Payment rejected. The customer was told why.',
      () => this.rejectVisible.set(false),
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

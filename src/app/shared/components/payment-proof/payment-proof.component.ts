import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, finalize } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { Payment } from '../../../core/models';
import { proofUnderReview, receiverTitle } from '../../../core/payments/manual-payments';
import {
  ManualPaymentService,
  PaymentKind,
  invoiceWarning,
} from '../../../core/services/manual-payment.service';
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
    NzCheckboxModule,
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

  readonly kind = input.required<PaymentKind>();
  readonly targetId = input.required<string>();
  readonly payment = input.required<Payment>();
  /** Order number or booking label, for the confirmation dialog. */
  readonly label = input('');

  readonly busy = signal(false);
  readonly approveVisible = signal(false);
  /** Email the invoice along with the approval. */
  readonly emailInvoice = signal(true);
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

  openApprove(): void {
    this.emailInvoice.set(true);
    this.approveVisible.set(true);
  }

  approve(): void {
    this.run(
      this.manual.approve(this.kind(), this.targetId(), this.emailInvoice()),
      'Payment approved.',
      () => this.approveVisible.set(false),
    );
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

  /** `request` may resolve with why the invoice email failed (see `ManualPaymentService.approve`). */
  private run(
    request: Observable<string | undefined | void>,
    success: string,
    done?: () => void,
  ): void {
    this.busy.set(true);
    request.pipe(finalize(() => this.busy.set(false))).subscribe({
      next: (invoiceError) => {
        this.msg.success(success);
        if (invoiceError) this.msg.warning(invoiceWarning(invoiceError), { nzDuration: 8000 });
        done?.();
      },
      error: (err) => this.msg.error(orderErrorMessage(err)),
    });
  }
}

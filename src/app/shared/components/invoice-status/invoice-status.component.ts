import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { finalize } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { InvoiceInfo, Payment } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { ManualPaymentService, PaymentKind } from '../../../core/services/manual-payment.service';
import { orderErrorMessage } from '../../../core/services/order.service';

/**
 * The invoice of a paid order or booking: its number and when it was emailed, and for staff a Send / Resend button.
 * PayMongo payments are invoiced automatically; transfers and on-site payments only when staff send them. Shown in the
 * order actions and the booking panel.
 */
@Component({
  selector: 'app-invoice-status',
  standalone: true,
  imports: [DatePipe, NzButtonModule, NzIconModule, NzModalModule],
  templateUrl: './invoice-status.component.html',
  styleUrl: './invoice-status.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoiceStatusComponent {
  private readonly manual = inject(ManualPaymentService);
  private readonly auth = inject(AuthService);
  private readonly msg = inject(NzMessageService);
  private readonly modal = inject(NzModalService);

  readonly kind = input.required<PaymentKind>();
  readonly targetId = input.required<string>();
  readonly payment = input<Payment | undefined>();
  readonly invoice = input<InvoiceInfo | undefined>();

  readonly busy = signal(false);
  readonly isStaff = computed(() => (this.auth.currentUser()?.role ?? 'customer') !== 'customer');
  /** Only paid payments get an invoice. Customers see the line once one was sent. */
  readonly visible = computed(
    () => this.payment()?.status === 'Paid' && (this.isStaff() || !!this.invoice()?.sentAt),
  );

  send(): void {
    const resend = !!this.invoice()?.sentAt;
    this.modal.confirm({
      nzTitle: resend ? 'Resend the invoice?' : 'Send the invoice?',
      nzContent: resend
        ? `The customer gets invoice ${this.invoice()!.number} again by email.`
        : 'The customer gets the invoice for this payment by email, with a PDF copy.',
      nzOkText: resend ? 'Resend' : 'Send',
      nzCancelText: 'Cancel',
      nzOnOk: () => {
        this.busy.set(true);
        this.manual
          .sendInvoice(this.kind(), this.targetId())
          .pipe(finalize(() => this.busy.set(false)))
          .subscribe({
            next: () => this.msg.success('Invoice emailed to the customer.'),
            error: (err) => this.msg.error(orderErrorMessage(err)),
          });
      },
    });
  }
}

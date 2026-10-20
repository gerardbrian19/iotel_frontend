import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { formatSlot } from '../../../core/booking/schedule';
import { Booking } from '../../../core/models';
import { ONSITE_METHOD_OPTIONS, proofUnderReview } from '../../../core/payments/manual-payments';
import {
  MIN_CHECKOUT_AMOUNT,
  PAYMENT_PROVIDER_LABELS,
  paymentMethodLabel,
} from '../../../core/payments/payment-methods';
import { AuthService } from '../../../core/services/auth.service';
import {
  BookingService,
  awaitingPayment,
  bookingErrorMessage,
  paysOnsite,
} from '../../../core/services/booking.service';
import { ManualPaymentService } from '../../../core/services/manual-payment.service';
import { ManualPaymentPanelComponent } from '../manual-payment-panel/manual-payment-panel.component';
import { PaymentProofComponent } from '../payment-proof/payment-proof.component';
import { SlotPickerComponent } from '../slot-picker/slot-picker.component';

interface StatusView {
  label: string;
  color: string;
}

/**
 * One booking with what happens next and the actions that fit the viewer and the booking's status:
 *
 * - Customer: pay the quotation through PayMongo or by bank / GCash transfer (that is what confirms the booking), or
 *   choose to pay on site when the quote allows it; cancel until it is paid.
 * - Staff / admin: send a quotation, change the quote until it is paid, check a transfer, record an on-site payment,
 *   reschedule, mark it completed, cancel an unpaid booking, refund a paid one (which cancels it).
 *
 * Used in the customer's booking list, the staff bookings board and above the booking's chat thread.
 */
@Component({
  selector: 'app-booking-panel',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    NzButtonModule,
    NzCheckboxModule,
    NzFormModule,
    NzIconModule,
    NzInputModule,
    NzInputNumberModule,
    NzModalModule,
    NzSelectModule,
    NzTagModule,
    ManualPaymentPanelComponent,
    PaymentProofComponent,
    SlotPickerComponent,
  ],
  templateUrl: './booking-panel.component.html',
  styleUrl: './booking-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingPanelComponent {
  private readonly bookings = inject(BookingService);
  private readonly manual = inject(ManualPaymentService);
  private readonly auth = inject(AuthService);
  private readonly msg = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  private readonly fb = inject(FormBuilder);

  readonly minAmount = MIN_CHECKOUT_AMOUNT;
  readonly onsiteMethods = ONSITE_METHOD_OPTIONS;

  readonly booking = input.required<Booking>();
  /** Shows a link to the booking's chat; leave off where the chat is already open. */
  readonly showChatLink = input(false);
  /** Starts with the details (problem description, quote note, contact) open. */
  readonly startExpanded = input(false);

  readonly expanded = linkedSignal(() => this.startExpanded());
  readonly busy = signal(false);
  readonly quoteVisible = signal(false);
  readonly rescheduleVisible = signal(false);
  readonly refundVisible = signal(false);
  readonly recordVisible = signal(false);
  /** The customer opened the bank / GCash transfer form. */
  readonly transferOpen = signal(false);

  readonly newDate = signal<string | null>(null);
  readonly newTime = signal<string | null>(null);
  readonly refundReason = signal('');
  readonly refundReference = signal('');

  readonly quoteForm = this.fb.nonNullable.group({
    amount: [0, [Validators.required, Validators.min(MIN_CHECKOUT_AMOUNT)]],
    note: ['', Validators.maxLength(500)],
    allowOnsite: [true],
  });

  readonly recordForm = this.fb.nonNullable.group({
    method: ['cash' as (typeof ONSITE_METHOD_OPTIONS)[number]['value'], Validators.required],
    amount: [0, [Validators.required, Validators.min(1)]],
    receiptNumber: ['', Validators.maxLength(40)],
    complete: [true],
  });

  private readonly role = computed(() => this.auth.currentUser()?.role ?? 'customer');
  readonly isStaff = computed(() => this.role() !== 'customer');
  readonly chatLink = computed(() => `/${this.role()}/messages`);

  readonly when = computed(() =>
    formatSlot(this.booking().preferredDate, this.booking().preferredTime),
  );

  /** Waiting for the customer's payment (in advance, or on site if they chose that). */
  readonly awaitingPayment = computed(() => awaitingPayment(this.booking()));
  readonly paysOnsite = computed(() => paysOnsite(this.booking()));
  /** A transfer proof is waiting for staff. */
  readonly underReview = computed(() => proofUnderReview(this.booking().payment));
  readonly isPaid = computed(() => this.booking().payment?.status === 'Paid');
  readonly paidWith = computed(() => paymentMethodLabel(this.booking().payment?.method));
  readonly providerLabel = computed(() => PAYMENT_PROVIDER_LABELS[this.booking().payment?.provider ?? 'paymongo']);
  /** The customer can still choose how to pay. */
  readonly customerCanPay = computed(() => !this.isStaff() && this.awaitingPayment() && !this.underReview());
  readonly canChooseOnsite = computed(
    () => this.customerCanPay() && !!this.booking().quote?.allowOnsite && !this.paysOnsite(),
  );
  /** The transfer form or what was sent: open on request, or while a transfer is under way. */
  readonly showTransfer = computed(() => {
    if (this.isStaff() || !this.awaitingPayment()) return false;
    const manual = this.booking().payment?.manual;
    return this.transferOpen() || this.underReview() || manual?.state === 'rejected';
  });
  /** Staff see what the customer sent for a transfer. */
  readonly showProof = computed(() => this.isStaff() && !!this.booking().payment?.manual?.proofPath);
  /** Staff record money received on site (or any payment made at the shop) for a confirmed booking. */
  readonly canRecord = computed(
    () => this.isStaff() && this.booking().status === 'Confirmed' && !this.isPaid() && !this.underReview(),
  );
  /** Transfers and on-site payments are refunded by staff themselves, not through PayMongo. */
  readonly manualRefund = computed(() => (this.booking().payment?.provider ?? 'paymongo') !== 'paymongo');
  readonly canReschedule = computed(() =>
    ['Pending', 'Confirmed', 'Paid'].includes(this.booking().status),
  );
  /** Staff can still quote until it is paid. */
  readonly canQuote = computed(() => {
    const b = this.booking();
    return (b.status === 'Pending' || b.status === 'Confirmed') && !this.isPaid() && !this.underReview();
  });
  /** Unpaid bookings only (not while a transfer is being checked); paid ones are cancelled by refunding them. */
  readonly canCancel = computed(() => {
    const b = this.booking();
    return (b.status === 'Pending' || b.status === 'Confirmed') && !this.isPaid() && !this.underReview();
  });
  /** Staff refund a paid booking that hasn't been carried out, or one paid after it was cancelled. */
  readonly canRefund = computed(() => {
    const b = this.booking();
    return this.isStaff() && this.isPaid() && b.status !== 'Completed';
  });

  readonly status = computed<StatusView>(() => {
    const b = this.booking();
    if (this.underReview()) return { label: 'Verifying payment', color: 'processing' };
    if (this.paysOnsite()) return { label: 'Booked · Pay on site', color: 'blue' };
    if (this.awaitingPayment()) return { label: 'Awaiting payment', color: 'processing' };
    switch (b.status) {
      case 'Pending':
        return { label: 'Requested', color: 'warning' };
      case 'Paid':
        return { label: 'Booked · Paid', color: 'success' };
      case 'Completed':
        return { label: 'Completed', color: 'success' };
      case 'Cancelled':
        return { label: 'Cancelled', color: 'error' };
      default:
        return { label: b.status, color: 'default' };
    }
  });

  /** One line on what happens next, from the viewer's side. */
  readonly hint = computed(() => {
    const b = this.booking();
    const staff = this.isStaff();
    if (b.status === 'Cancelled') {
      if (this.isPaid()) {
        return staff
          ? 'Cancelled, but a payment came in for it. Refund the payment.'
          : 'This booking was cancelled. We received a payment for it and will refund it.';
      }
      return b.payment?.status === 'Refunded'
        ? 'This booking was cancelled and the payment was refunded.'
        : 'This booking was cancelled and its time slot is free again.';
    }
    if (b.status === 'Completed') return 'This service has been completed.';
    if (b.status === 'Paid') {
      return staff
        ? `Paid (${this.providerLabel()}). Mark it completed once the service is done.`
        : `Payment received. Your booking is confirmed. See you on ${this.when()}.`;
    }
    if (this.underReview()) {
      return staff
        ? 'The customer sent a bank / GCash transfer. Check that it arrived, then approve or reject it.'
        : 'We received your proof of payment and are checking it. Your booking is confirmed once it is verified.';
    }
    if (this.paysOnsite()) {
      return staff
        ? 'The customer will pay on site. Record the payment when you receive it.'
        : `Your booking is confirmed. Pay on site on ${this.when()}, or pay now if you prefer.`;
    }
    if (this.awaitingPayment()) {
      if (b.payment?.manual?.state === 'rejected') {
        return staff
          ? 'The transfer could not be verified. Waiting for the customer to send it again.'
          : `We couldn't verify your payment: ${b.payment.manual.rejectReason ?? ''}`;
      }
      return staff
        ? 'Waiting for the customer to pay online or by transfer' + (b.quote?.allowOnsite ? ', or choose to pay on site.' : '.')
        : 'Your quotation is ready. Pay it online or by bank / GCash transfer to confirm your booking' +
            (b.quote?.allowOnsite ? ', or choose to pay on site' : '') +
            '; the time slot is held for you until then.';
    }
    return staff
      ? 'Discuss the job with the customer in chat, then send them a quotation to pay.'
      : 'We will review your request and reply in chat with a quotation. Your booking is confirmed once you pay it. You can also ask to change the date there.';
  });

  toggle(): void {
    this.expanded.update((open) => !open);
  }

  openQuote(): void {
    const b = this.booking();
    this.quoteForm.reset({
      amount: b.quote?.amount ?? b.servicePrice,
      note: b.quote?.note ?? '',
      allowOnsite: b.quote?.allowOnsite ?? true,
    });
    this.quoteVisible.set(true);
  }

  saveQuote(): void {
    if (this.quoteForm.invalid) return;
    const { amount, note, allowOnsite } = this.quoteForm.getRawValue();
    this.run(
      this.bookings.confirm(this.booking(), amount, note, allowOnsite),
      'Quotation sent. The customer can now pay.',
      () => this.quoteVisible.set(false),
    );
  }

  openReschedule(): void {
    this.newDate.set(null);
    this.newTime.set(null);
    this.rescheduleVisible.set(true);
  }

  saveReschedule(): void {
    const date = this.newDate();
    const time = this.newTime();
    if (!date || !time) return;
    this.run(this.bookings.reschedule(this.booking(), date, time), 'Appointment rescheduled.', () =>
      this.rescheduleVisible.set(false),
    );
  }

  /** Sends the customer to the PayMongo checkout for the quote. */
  pay(): void {
    this.busy.set(true);
    this.bookings.payQuote(this.booking()).subscribe({
      // The page is left, so `busy` stays on until the browser navigates away.
      next: (url) => window.location.assign(url),
      error: (err) => {
        this.busy.set(false);
        this.msg.error(bookingErrorMessage(err));
      },
    });
  }

  toggleTransfer(): void {
    this.transferOpen.update((open) => !open);
  }

  /** Customer: will pay on site instead of in advance. */
  chooseOnsite(): void {
    this.modal.confirm({
      nzTitle: 'Pay on site?',
      nzContent: `Your booking is confirmed now, and you pay ${this.booking().quote?.amount.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })} at our shop on ${this.when()}. You can still pay online before then.`,
      nzOkText: 'Pay on site',
      nzCancelText: 'Back',
      nzOnOk: () => this.run(this.manual.chooseOnsite(this.booking().id), 'Booked. You will pay on site.'),
    });
  }

  openRecord(): void {
    const b = this.booking();
    this.recordForm.reset({ method: 'cash', amount: b.quote?.amount ?? 0, receiptNumber: '', complete: true });
    this.recordVisible.set(true);
  }

  saveRecord(): void {
    if (this.recordForm.invalid) return;
    const input = this.recordForm.getRawValue();
    this.run(
      this.manual.recordOnsite(this.booking().id, input),
      input.complete ? 'Payment recorded and booking completed.' : 'Payment recorded.',
      () => this.recordVisible.set(false),
    );
  }

  openRefund(): void {
    this.refundReason.set('');
    this.refundReference.set('');
    this.refundVisible.set(true);
  }

  refund(): void {
    if (this.manualRefund() && !this.refundReference().trim()) return;
    this.run(
      this.bookings.refund(this.booking(), this.refundReason(), this.refundReference()),
      'Payment refunded.',
      () => this.refundVisible.set(false),
    );
  }

  complete(): void {
    this.run(this.bookings.complete(this.booking()), 'Booking marked as completed.');
  }

  confirmCancel(): void {
    this.modal.confirm({
      nzTitle: 'Cancel this booking?',
      nzContent: this.isStaff()
        ? 'The customer will be notified in chat and the time slot will be freed.'
        : 'Your time slot will be freed. You can book again any time. If you just paid, wait a moment: a paid booking can no longer be cancelled here.',
      nzOkText: 'Yes, cancel it',
      nzOkDanger: true,
      nzCancelText: 'Keep booking',
      nzOnOk: () => this.run(this.bookings.cancel(this.booking()), 'Booking cancelled.'),
    });
  }

  private run(request: Observable<unknown>, success: string, done?: () => void): void {
    this.busy.set(true);
    request.pipe(finalize(() => this.busy.set(false))).subscribe({
      next: () => {
        this.msg.success(success);
        done?.();
      },
      error: (err) => this.msg.error(bookingErrorMessage(err)),
    });
  }
}

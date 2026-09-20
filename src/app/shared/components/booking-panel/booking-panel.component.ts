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
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { formatSlot } from '../../../core/booking/schedule';
import { BOOKING_PAYMENT_METHODS, Booking, BookingPaymentMethod } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { BookingService, bookingErrorMessage } from '../../../core/services/booking.service';
import { SlotPickerComponent } from '../slot-picker/slot-picker.component';

interface StatusView {
  label: string;
  color: string;
}

/**
 * One booking with what happens next and the actions that fit the viewer and the booking's status:
 *
 * - Customer: pay a confirmed booking, cancel until a payment is submitted.
 * - Staff / admin: confirm with a quotation, change the quote, reschedule, verify or reject a payment,
 *   mark it completed, cancel.
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
    NzFormModule,
    NzIconModule,
    NzInputModule,
    NzInputNumberModule,
    NzModalModule,
    NzRadioModule,
    NzTagModule,
    SlotPickerComponent,
  ],
  templateUrl: './booking-panel.component.html',
  styleUrl: './booking-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingPanelComponent {
  private readonly bookings = inject(BookingService);
  private readonly auth = inject(AuthService);
  private readonly msg = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  private readonly fb = inject(FormBuilder);

  readonly booking = input.required<Booking>();
  /** Shows a link to the booking's chat; leave off where the chat is already open. */
  readonly showChatLink = input(false);
  /** Starts with the details (problem description, quote note, contact) open. */
  readonly startExpanded = input(false);

  readonly expanded = linkedSignal(() => this.startExpanded());
  readonly busy = signal(false);
  readonly quoteVisible = signal(false);
  readonly rescheduleVisible = signal(false);
  readonly payVisible = signal(false);
  readonly rejectVisible = signal(false);

  readonly paymentMethods = BOOKING_PAYMENT_METHODS;
  readonly newDate = signal<string | null>(null);
  readonly newTime = signal<string | null>(null);
  readonly rejectReason = signal('');

  readonly quoteForm = this.fb.nonNullable.group({
    amount: [0, [Validators.required, Validators.min(1)]],
    note: ['', Validators.maxLength(500)],
  });
  readonly payForm = this.fb.nonNullable.group({
    method: ['GCash' as BookingPaymentMethod, Validators.required],
    referenceNumber: [
      '',
      [
        Validators.required,
        Validators.minLength(6),
        Validators.maxLength(40),
        Validators.pattern(/^[A-Za-z0-9 -]+$/),
      ],
    ],
  });

  private readonly role = computed(() => this.auth.currentUser()?.role ?? 'customer');
  readonly isStaff = computed(() => this.role() !== 'customer');
  readonly chatLink = computed(() => `/${this.role()}/messages`);

  readonly when = computed(() =>
    formatSlot(this.booking().preferredDate, this.booking().preferredTime),
  );

  /** Waiting for the customer's payment, i.e. confirmed and nothing submitted yet. */
  readonly awaitingPayment = computed(() => {
    const b = this.booking();
    return b.status === 'Confirmed' && !b.payment;
  });
  readonly paymentUnderReview = computed(() => {
    const b = this.booking();
    return b.status === 'Confirmed' && b.payment?.status === 'Submitted';
  });
  readonly canReschedule = computed(() =>
    ['Pending', 'Confirmed', 'Paid'].includes(this.booking().status),
  );
  /** Staff can still quote until a payment has been submitted. */
  readonly canQuote = computed(() => {
    const b = this.booking();
    return (b.status === 'Pending' || b.status === 'Confirmed') && !b.payment;
  });
  readonly canCancel = computed(() => {
    const b = this.booking();
    return this.isStaff()
      ? ['Pending', 'Confirmed', 'Paid'].includes(b.status)
      : (b.status === 'Pending' || b.status === 'Confirmed') && !b.payment;
  });

  readonly status = computed<StatusView>(() => {
    const b = this.booking();
    if (this.awaitingPayment()) return { label: 'Awaiting payment', color: 'processing' };
    if (this.paymentUnderReview()) return { label: 'Payment under review', color: 'processing' };
    switch (b.status) {
      case 'Pending':
        return { label: 'Pending', color: 'warning' };
      case 'Paid':
        return { label: 'Paid', color: 'success' };
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
    if (b.status === 'Cancelled')
      return 'This booking was cancelled and its time slot is free again.';
    if (b.status === 'Completed') return 'This service has been completed.';
    if (b.status === 'Paid') {
      return staff
        ? 'Payment verified. Mark it completed once the service is done.'
        : `Payment received. See you on ${this.when()}.`;
    }
    if (this.paymentUnderReview()) {
      return staff
        ? `Check ${b.payment?.method} reference ${b.payment?.referenceNumber} against your records, then verify or reject it.`
        : 'Payment sent. We will verify it shortly.';
    }
    if (this.awaitingPayment()) {
      return staff
        ? 'Waiting for the customer to pay.'
        : 'Your booking is confirmed. Pay the amount below to proceed.';
    }
    return staff
      ? 'Discuss the job with the customer in chat, then confirm the booking with a quotation.'
      : 'We will review your request and reply in chat with a quotation. You can also ask to change the date there.';
  });

  toggle(): void {
    this.expanded.update((open) => !open);
  }

  openQuote(): void {
    const b = this.booking();
    this.quoteForm.reset({ amount: b.quote?.amount ?? b.servicePrice, note: b.quote?.note ?? '' });
    this.quoteVisible.set(true);
  }

  saveQuote(): void {
    if (this.quoteForm.invalid) return;
    const { amount, note } = this.quoteForm.getRawValue();
    this.run(
      this.bookings.confirm(this.booking(), amount, note),
      'Booking confirmed. The customer can now pay.',
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

  openPay(): void {
    this.payForm.reset({ method: 'GCash', referenceNumber: '' });
    this.payVisible.set(true);
  }

  submitPayment(): void {
    if (this.payForm.invalid) return;
    const { method, referenceNumber } = this.payForm.getRawValue();
    this.run(
      this.bookings.submitPayment(this.booking(), method, referenceNumber),
      'Payment submitted. We will verify it shortly.',
      () => this.payVisible.set(false),
    );
  }

  verifyPayment(): void {
    this.run(this.bookings.verifyPayment(this.booking()), 'Payment verified.');
  }

  openReject(): void {
    this.rejectReason.set('');
    this.rejectVisible.set(true);
  }

  rejectPayment(): void {
    this.run(
      this.bookings.rejectPayment(this.booking(), this.rejectReason()),
      'Payment rejected. The customer can submit it again.',
      () => this.rejectVisible.set(false),
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
        : 'Your time slot will be freed. You can book again any time.',
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

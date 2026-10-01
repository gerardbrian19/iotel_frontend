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
import { NzTagModule } from 'ng-zorro-antd/tag';
import { formatSlot } from '../../../core/booking/schedule';
import { Booking } from '../../../core/models';
import { paymentMethodLabel } from '../../../core/payments/payment-methods';
import { AuthService } from '../../../core/services/auth.service';
import {
  BookingService,
  awaitingPayment,
  bookingErrorMessage,
} from '../../../core/services/booking.service';
import { SlotPickerComponent } from '../slot-picker/slot-picker.component';

interface StatusView {
  label: string;
  color: string;
}

/**
 * One booking with what happens next and the actions that fit the viewer and the booking's status:
 *
 * - Customer: pay a confirmed booking through PayMongo, cancel until it is paid.
 * - Staff / admin: confirm with a quotation, change the quote until it is paid, reschedule, mark it completed, cancel an
 *   unpaid booking, refund a paid one (which cancels it).
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
  readonly refundVisible = signal(false);

  readonly newDate = signal<string | null>(null);
  readonly newTime = signal<string | null>(null);
  readonly refundReason = signal('');

  readonly quoteForm = this.fb.nonNullable.group({
    amount: [0, [Validators.required, Validators.min(1)]],
    note: ['', Validators.maxLength(500)],
  });

  private readonly role = computed(() => this.auth.currentUser()?.role ?? 'customer');
  readonly isStaff = computed(() => this.role() !== 'customer');
  readonly chatLink = computed(() => `/${this.role()}/messages`);

  readonly when = computed(() =>
    formatSlot(this.booking().preferredDate, this.booking().preferredTime),
  );

  /** Waiting for the customer's PayMongo payment. */
  readonly awaitingPayment = computed(() => awaitingPayment(this.booking()));
  readonly isPaid = computed(() => this.booking().payment?.status === 'Paid');
  readonly paidWith = computed(() => paymentMethodLabel(this.booking().payment?.method));
  readonly canReschedule = computed(() =>
    ['Pending', 'Confirmed', 'Paid'].includes(this.booking().status),
  );
  /** Staff can still quote until it is paid. */
  readonly canQuote = computed(() => {
    const b = this.booking();
    return (b.status === 'Pending' || b.status === 'Confirmed') && !this.isPaid();
  });
  /** Unpaid bookings only; paid ones are cancelled by refunding them. */
  readonly canCancel = computed(() => {
    const b = this.booking();
    return (b.status === 'Pending' || b.status === 'Confirmed') && !this.isPaid();
  });
  /** Staff refund a paid booking that hasn't been carried out, or one paid after it was cancelled. */
  readonly canRefund = computed(() => {
    const b = this.booking();
    return this.isStaff() && this.isPaid() && b.status !== 'Completed';
  });

  readonly status = computed<StatusView>(() => {
    const b = this.booking();
    if (this.awaitingPayment()) return { label: 'Awaiting payment', color: 'processing' };
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
        ? 'Paid through PayMongo. Mark it completed once the service is done.'
        : `Payment received. See you on ${this.when()}.`;
    }
    if (this.awaitingPayment()) {
      return staff
        ? 'Waiting for the customer to pay through PayMongo.'
        : 'Your booking is confirmed. Pay the amount through PayMongo to lock in your slot.';
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

  openRefund(): void {
    this.refundReason.set('');
    this.refundVisible.set(true);
  }

  refund(): void {
    this.run(this.bookings.refund(this.booking(), this.refundReason()), 'Payment refunded.', () =>
      this.refundVisible.set(false),
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

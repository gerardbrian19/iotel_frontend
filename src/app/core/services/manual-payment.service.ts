import { Injectable, computed, inject } from '@angular/core';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import { Observable, defer } from 'rxjs';
import { FIREBASE_STORAGE, FUNCTIONS } from '../firebase/firebase';
import { OnsiteMethod, Payment } from '../models';
import { proofUnderReview } from '../payments/manual-payments';
import { imageFileError, shrinkScreenshot } from '../../shared/utils/proof-image';
import { AuthService } from './auth.service';
import { BookingService } from './booking.service';
import { OrderService } from './order.service';

export type PaymentKind = 'order' | 'booking';

/** What the customer fills in after sending a GCash / bank transfer. */
export interface TransferProof {
  kind: PaymentKind;
  /** The order or booking id. */
  id: string;
  receiverId: string;
  referenceNumber: string;
  amountSent: number;
  /** ISO time the customer sent it. */
  sentAt: string;
  screenshot: File;
}

/** A transfer proof waiting for staff, from an order or a booking. */
export interface ProofToVerify {
  kind: PaymentKind;
  id: string;
  /** `ORD-0007`, or the booked service. */
  label: string;
  customerName: string;
  payment: Payment;
  submittedAt: string;
  /** The booking's chat thread; empty for orders. */
  conversationId: string;
}

export interface OnsitePaymentInput {
  method: OnsiteMethod;
  amount: number;
  receiptNumber: string;
  /** Also mark the booking completed. */
  complete: boolean;
  /** Also email the invoice to the customer. */
  sendInvoice: boolean;
}

/** Shown when a payment went through but its invoice email didn't. */
export function invoiceWarning(error: string): string {
  return `The invoice wasn't emailed: ${error} Use "Send invoice" to try again.`;
}

/**
 * GCash / bank transfers checked by staff, and on-site booking payments. Everything that changes a payment runs in
 * the Cloud Functions (functions/src/manual-payments.ts); this uploads the screenshot to Storage and calls them.
 */
@Injectable({ providedIn: 'root' })
export class ManualPaymentService {
  private readonly functions = inject(FUNCTIONS);
  private readonly storage = inject(FIREBASE_STORAGE);
  private readonly auth = inject(AuthService);
  private readonly orders = inject(OrderService);
  private readonly bookings = inject(BookingService);

  /** Staff: transfer proofs waiting to be checked, oldest first. Built from the live orders and bookings. */
  readonly toVerify = computed<ProofToVerify[]>(() => {
    if ((this.auth.currentUser()?.role ?? 'customer') === 'customer') return [];
    const orders = this.orders
      .orders()
      .filter((o) => proofUnderReview(o.payment))
      .map((o) => ({
        kind: 'order' as const,
        id: o.id,
        label: o.code,
        customerName: o.customerName,
        payment: o.payment,
        submittedAt: o.payment.manual?.submittedAt ?? o.updatedAt,
        conversationId: '',
      }));
    const bookings = this.bookings
      .bookings()
      .filter((b) => proofUnderReview(b.payment))
      .map((b) => ({
        kind: 'booking' as const,
        id: b.id,
        label: b.serviceName,
        customerName: b.customerName,
        payment: b.payment!,
        submittedAt: b.payment?.manual?.submittedAt ?? b.updatedAt ?? '',
        conversationId: b.conversationId,
      }));
    return [...orders, ...bookings].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  });

  /** Customer: uploads the screenshot, then records the transfer for staff to check. */
  submit(proof: TransferProof): Observable<void> {
    return defer(async () => {
      const user = this.auth.currentUser();
      if (!user) throw new Error('Please sign in again.');
      const problem = imageFileError(proof.screenshot);
      if (problem) throw new Error(problem);
      const image = await shrinkScreenshot(proof.screenshot);
      const type = image.type || 'image/jpeg';
      const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
      const proofPath = `paymentProofs/${user.id}/${proof.kind}-${proof.id}/${Date.now()}.${ext}`;
      await uploadBytes(ref(this.storage, proofPath), image, { contentType: type });
      await this.call('submitManualPayment', {
        kind: proof.kind,
        id: proof.id,
        receiverId: proof.receiverId,
        referenceNumber: proof.referenceNumber.trim(),
        amountSent: proof.amountSent,
        sentAt: proof.sentAt,
        proofPath,
      });
    });
  }

  /**
   * Staff: the transfer arrived (the order or booking is now Paid). With `sendInvoice` the invoice is emailed too;
   * resolves with why that failed, if it did (the approval stands either way).
   */
  approve(kind: PaymentKind, id: string, sendInvoice: boolean): Observable<string | undefined> {
    return defer(
      async () =>
        (await this.call('reviewManualPayment', { kind, id, decision: 'approve', sendInvoice }))
          .invoiceError,
    );
  }

  /** Staff: the transfer couldn't be found or doesn't match; the customer is told why and can send it again. */
  reject(kind: PaymentKind, id: string, reason: string): Observable<void> {
    return defer(async () => {
      await this.call('reviewManualPayment', {
        kind,
        id,
        decision: 'reject',
        reason: reason.trim(),
      });
    });
  }

  /** Customer: will pay the booking's quote on site. */
  chooseOnsite(bookingId: string): Observable<void> {
    return defer(async () => {
      await this.call('chooseOnsitePayment', { bookingId });
    });
  }

  /** Staff: records money received on site for a booking. Resolves with why the invoice failed, as `approve`. */
  recordOnsite(bookingId: string, input: OnsitePaymentInput): Observable<string | undefined> {
    return defer(
      async () =>
        (
          await this.call('recordOnsitePayment', {
            bookingId,
            method: input.method,
            amount: input.amount,
            receiptNumber: input.receiptNumber.trim(),
            complete: input.complete,
            sendInvoice: input.sendInvoice,
          })
        ).invoiceError,
    );
  }

  /** Staff: emails (or re-emails) the invoice of a paid order or booking. */
  sendInvoice(kind: PaymentKind, id: string): Observable<void> {
    return defer(async () => {
      await this.call('sendInvoiceEmail', { kind, id });
    });
  }

  private async call(name: string, data: object): Promise<{ ok: boolean; invoiceError?: string }> {
    const res = await httpsCallable<object, { ok: boolean; invoiceError?: string }>(
      this.functions,
      name,
    )(data);
    return res.data;
  }
}

import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  DocumentData,
  QueryDocumentSnapshot,
  WriteBatch,
  collection,
  deleteField,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Observable, from } from 'rxjs';
import { formatSlot, slotId, toDateKey } from '../booking/schedule';
import { FIRESTORE } from '../firebase/firebase';
import { dataOf, isoOf } from '../firebase/timestamps';
import {
  BOOKING_PAYMENT_METHODS,
  Booking,
  BookingPayment,
  BookingPaymentMethod,
  BookingStatus,
  Service,
} from '../models';
import { AuthService } from './auth.service';
import { MessageService } from './message.service';

const SERVICES = 'services';
const BOOKINGS = 'bookings';
const SLOTS = 'bookingSlots';

const STATUSES: readonly BookingStatus[] = [
  'Pending',
  'Confirmed',
  'Paid',
  'Completed',
  'Cancelled',
];

/** What the customer fills in. The rest of the booking (status, ids, timestamps) is set here. */
export interface NewBooking {
  service: Service;
  preferredDate: string;
  preferredTime: string;
  customerName: string;
  customerEmail: string;
  customerMobile: string;
  notes: string;
}

export function toService(id: string, data: DocumentData): Service {
  return {
    id,
    title: String(data['title'] ?? id),
    price: Number(data['price']) || 0,
    description: String(data['description'] ?? ''),
  };
}

function toBooking(snap: QueryDocumentSnapshot<DocumentData>): Booking {
  const data = dataOf(snap);
  const quote = data['quote'];
  const payment = data['payment'];
  return {
    id: snap.id,
    serviceId: String(data['serviceId'] ?? ''),
    serviceName: String(data['serviceName'] ?? ''),
    servicePrice: Number(data['servicePrice']) || 0,
    customerId: String(data['customerId'] ?? ''),
    customerName: String(data['customerName'] ?? ''),
    customerEmail: String(data['customerEmail'] ?? ''),
    customerMobile: String(data['customerMobile'] ?? ''),
    preferredDate: String(data['preferredDate'] ?? ''),
    preferredTime: String(data['preferredTime'] ?? ''),
    notes: String(data['notes'] ?? ''),
    status: STATUSES.includes(data['status']) ? data['status'] : 'Pending',
    conversationId: String(data['conversationId'] ?? ''),
    quote: quote
      ? {
          amount: Number(quote['amount']) || 0,
          note: String(quote['note'] ?? ''),
          quotedAt: isoOf(quote['quotedAt']),
        }
      : undefined,
    payment: payment
      ? ({
          method: BOOKING_PAYMENT_METHODS.includes(payment['method']) ? payment['method'] : 'GCash',
          referenceNumber: String(payment['referenceNumber'] ?? ''),
          amount: Number(payment['amount']) || 0,
          status: payment['status'] === 'Verified' ? 'Verified' : 'Submitted',
          submittedAt: isoOf(payment['submittedAt']),
        } satisfies BookingPayment)
      : undefined,
    createdAt: isoOf(data['createdAt']),
    updatedAt: isoOf(data['updatedAt']),
  };
}

const peso = (amount: number) => `₱${amount.toLocaleString('en-PH')}`;

/** A message for the user for whatever went wrong while changing a booking. */
export function bookingErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  if (code === 'permission-denied') {
    return 'That change was not allowed. The time slot may have just been taken or the booking changed, so please refresh and try again.';
  }
  if (code === 'unavailable')
    return 'You seem to be offline. Please check your connection and try again.';
  return err instanceof Error && !code ? err.message : 'Something went wrong. Please try again.';
}

/**
 * Service bookings, stored in Firestore.
 *
 * - `services/{id}`: the catalog of bookable services (seed with `npm run seed:services`).
 * - `bookings/{id}`: one per request. Customers see their own; staff and admins see all of them.
 * - `bookingSlots/{date}T{HH:mm}`: one document per taken slot, created and deleted in the same batch as the
 *   booking that holds it. The id is the lock: creating a slot that exists is an update, which the rules deny,
 *   so two customers can never book the same slot. Every signed-in user can read the slots to see availability.
 * - Each booking has a chat (`conversations/{id}`, see MessageService) where the customer and staff discuss the
 *   problem, the quotation and any change of date. Every status change also posts an `event` line there.
 *
 * Flow: the customer books (Pending) → staff and customer discuss in chat → staff confirms with a quote
 * (Confirmed) → the customer pays and submits the reference number → staff verifies it (Paid) → Completed.
 */
@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);

  private readonly _services = signal<Service[]>([]);
  private readonly _bookings = signal<Booking[]>([]);
  private readonly _takenSlots = signal<ReadonlySet<string>>(new Set());
  private readonly _loading = signal(false);
  private readonly _error = signal(false);

  readonly services = this._services.asReadonly();
  /** Newest first. Customers get their own bookings, staff and admins all of them. */
  readonly bookings = this._bookings.asReadonly();
  readonly byId = computed(() => new Map(this._bookings().map((b) => [b.id, b])));
  /** Ids (`date` + `T` + `time`) of slots that are booked from today on; see `slotId` in the schedule. */
  readonly takenSlots = this._takenSlots.asReadonly();
  /** True until the first bookings snapshot (or error) arrives. */
  readonly loading = this._loading.asReadonly();
  /** True when bookings could not be loaded. */
  readonly error = this._error.asReadonly();

  private readonly viewer = computed(() => {
    const user = this.auth.currentUser();
    return user ? { id: user.id, role: user.role } : null;
  });

  constructor() {
    effect((onCleanup) => {
      const viewer = this.viewer();
      untracked(() => {
        this._services.set([]);
        this._bookings.set([]);
        this._takenSlots.set(new Set());
        this._error.set(false);
        this._loading.set(viewer !== null);
      });
      if (!viewer) return;

      const unsubscribes = [
        onSnapshot(
          collection(this.db, SERVICES),
          (snapshot) => {
            const list = snapshot.docs.map((d) => toService(d.id, d.data()));
            this._services.set(
              list.sort((a, b) => a.price - b.price || a.title.localeCompare(b.title)),
            );
          },
          (err) => console.error('Could not load services', err),
        ),
        onSnapshot(
          viewer.role === 'customer'
            ? query(collection(this.db, BOOKINGS), where('customerId', '==', viewer.id))
            : collection(this.db, BOOKINGS),
          (snapshot) => {
            const list = snapshot.docs
              .map(toBooking)
              .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
            this._bookings.set(list);
            this._error.set(false);
            this._loading.set(false);
          },
          (err) => {
            console.error('Could not load bookings', err);
            this._error.set(true);
            this._loading.set(false);
          },
        ),
        onSnapshot(
          query(collection(this.db, SLOTS), where('date', '>=', toDateKey(new Date()))),
          (snapshot) => this._takenSlots.set(new Set(snapshot.docs.map((d) => d.id))),
          (err) => console.error('Could not load availability', err),
        ),
      ];
      onCleanup(() => unsubscribes.forEach((unsubscribe) => unsubscribe()));
    });
  }

  /** Books the slot, opens the booking's chat with the customer's description as the first message. */
  create(input: NewBooking): Observable<{ bookingId: string; conversationId: string }> {
    return this.commit((batch) => {
      const user = this.requireUser();
      if (this._takenSlots().has(slotId(input.preferredDate, input.preferredTime))) {
        throw new Error('That time slot has just been booked. Please pick another one.');
      }
      const bookingRef = doc(collection(this.db, BOOKINGS));
      const conversationId = this.messages.newId();
      const notes = input.notes.trim();

      batch.set(bookingRef, {
        serviceId: input.service.id,
        serviceName: input.service.title,
        servicePrice: input.service.price,
        customerId: user.id,
        customerName: input.customerName.trim(),
        customerEmail: input.customerEmail.trim(),
        customerMobile: input.customerMobile.replace(/[\s-]/g, ''),
        preferredDate: input.preferredDate,
        preferredTime: input.preferredTime,
        notes,
        status: 'Pending',
        conversationId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      this.stageSlot(batch, input.preferredDate, input.preferredTime, bookingRef.id);
      this.messages.stageConversation(batch, conversationId, {
        customerId: user.id,
        customerName: input.customerName.trim(),
        subject: `Booking: ${input.service.title}`,
        bookingId: bookingRef.id,
        firstMessage:
          `Hi! I'd like to book ${input.service.title} on ${formatSlot(input.preferredDate, input.preferredTime)}.` +
          (notes ? `\n\n${notes}` : ''),
      });
      return { bookingId: bookingRef.id, conversationId };
    });
  }

  /** Cancels a booking and frees its slot. Customers can cancel until they submit a payment; staff and admins any time. */
  cancel(booking: Booking): Observable<void> {
    return this.commit((batch) => {
      const user = this.requireUser();
      this.requireStatus(booking, ['Pending', 'Confirmed', 'Paid']);
      batch.update(this.bookingRef(booking), { status: 'Cancelled', updatedAt: serverTimestamp() });
      batch.delete(this.slotRef(booking.preferredDate, booking.preferredTime));
      this.messages.stageMessage(
        batch,
        booking.conversationId,
        `${user.name} cancelled this booking.`,
        'event',
      );
    });
  }

  /**
   * Staff: settles the quotation and asks the customer to pay. Can be repeated to change the amount until a payment
   * has been submitted.
   */
  confirm(booking: Booking, amount: number, note: string): Observable<void> {
    return this.commit((batch) => {
      this.requireStatus(booking, ['Pending', 'Confirmed']);
      if (booking.payment)
        throw new Error('The customer has already submitted a payment for this booking.');
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter the amount to charge.');
      const quote = {
        amount: Math.round(amount * 100) / 100,
        note: note.trim(),
        quotedAt: serverTimestamp(),
      };
      batch.update(this.bookingRef(booking), {
        status: 'Confirmed',
        quote,
        updatedAt: serverTimestamp(),
      });
      this.messages.stageMessage(
        batch,
        booking.conversationId,
        `Booking confirmed for ${formatSlot(booking.preferredDate, booking.preferredTime)}. ` +
          `Amount to pay: ${peso(quote.amount)}.${quote.note ? ` ${quote.note}` : ''}`,
        'event',
      );
    });
  }

  /** Staff: moves the booking to another free slot. */
  reschedule(booking: Booking, date: string, time: string): Observable<void> {
    return this.commit((batch) => {
      this.requireStatus(booking, ['Pending', 'Confirmed', 'Paid']);
      if (date === booking.preferredDate && time === booking.preferredTime) {
        throw new Error('Pick a different date or time.');
      }
      if (this._takenSlots().has(slotId(date, time))) {
        throw new Error('That time slot is already booked. Please pick another one.');
      }
      batch.update(this.bookingRef(booking), {
        preferredDate: date,
        preferredTime: time,
        updatedAt: serverTimestamp(),
      });
      batch.delete(this.slotRef(booking.preferredDate, booking.preferredTime));
      this.stageSlot(batch, date, time, booking.id);
      this.messages.stageMessage(
        batch,
        booking.conversationId,
        `Appointment moved to ${formatSlot(date, time)} (was ${formatSlot(booking.preferredDate, booking.preferredTime)}).`,
        'event',
      );
    });
  }

  /** Customer: reports a payment of the quoted amount; staff then verify the reference number. */
  submitPayment(
    booking: Booking,
    method: BookingPaymentMethod,
    referenceNumber: string,
  ): Observable<void> {
    return this.commit((batch) => {
      this.requireStatus(booking, ['Confirmed']);
      if (booking.payment) throw new Error('A payment was already submitted for this booking.');
      if (!booking.quote) throw new Error('This booking has no confirmed amount yet.');
      const reference = referenceNumber.trim();
      const payment = {
        method,
        referenceNumber: reference,
        amount: booking.quote.amount,
        status: 'Submitted',
        submittedAt: serverTimestamp(),
      };
      batch.update(this.bookingRef(booking), { payment, updatedAt: serverTimestamp() });
      this.messages.stageMessage(
        batch,
        booking.conversationId,
        `Payment of ${peso(booking.quote.amount)} sent via ${method} (reference ${reference}). Waiting for verification.`,
        'event',
      );
    });
  }

  /** Staff: accepts the submitted payment. */
  verifyPayment(booking: Booking): Observable<void> {
    return this.commit((batch) => {
      this.requireStatus(booking, ['Confirmed']);
      if (booking.payment?.status !== 'Submitted')
        throw new Error('There is no payment to verify.');
      batch.update(this.bookingRef(booking), {
        status: 'Paid',
        'payment.status': 'Verified',
        updatedAt: serverTimestamp(),
      });
      this.messages.stageMessage(
        batch,
        booking.conversationId,
        'Payment verified. Thank you!',
        'event',
      );
    });
  }

  /** Staff: rejects a submitted payment (wrong reference, amount not received) so the customer can submit it again. */
  rejectPayment(booking: Booking, reason: string): Observable<void> {
    return this.commit((batch) => {
      this.requireStatus(booking, ['Confirmed']);
      if (booking.payment?.status !== 'Submitted')
        throw new Error('There is no payment to reject.');
      batch.update(this.bookingRef(booking), {
        payment: deleteField(),
        updatedAt: serverTimestamp(),
      });
      const why = reason.trim();
      this.messages.stageMessage(
        batch,
        booking.conversationId,
        `We couldn't verify your payment${why ? `: ${why}` : '.'} Please submit it again.`,
        'event',
      );
    });
  }

  /** Staff: the service was carried out. */
  complete(booking: Booking): Observable<void> {
    return this.commit((batch) => {
      this.requireStatus(booking, ['Paid']);
      batch.update(this.bookingRef(booking), { status: 'Completed', updatedAt: serverTimestamp() });
      this.messages.stageMessage(
        batch,
        booking.conversationId,
        'Service completed. Thank you for choosing IOTEL!',
        'event',
      );
    });
  }

  private bookingRef(booking: Booking) {
    return doc(this.db, BOOKINGS, booking.id);
  }

  private slotRef(date: string, time: string) {
    return doc(this.db, SLOTS, slotId(date, time));
  }

  private stageSlot(batch: WriteBatch, date: string, time: string, bookingId: string): void {
    batch.set(this.slotRef(date, time), { date, time, bookingId });
  }

  /** The screens hide actions that don't apply, but a booking can change under an open dialog. */
  private requireStatus(booking: Booking, allowed: readonly BookingStatus[]): void {
    const current = this.byId().get(booking.id)?.status ?? booking.status;
    if (!allowed.includes(current))
      throw new Error(`This booking is already ${current.toLowerCase()}.`);
  }

  private requireUser() {
    const user = this.auth.currentUser();
    if (!user) throw new Error('Sign in to manage bookings.');
    return user;
  }

  private commit<T>(build: (batch: WriteBatch) => T): Observable<T> {
    try {
      const batch = writeBatch(this.db);
      const result = build(batch);
      return from(batch.commit().then(() => result));
    } catch (err) {
      return from(Promise.reject(err));
    }
  }
}

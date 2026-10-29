/**
 * Payments that don't go through PayMongo: GCash / bank transfers checked by staff, and on-site payments for service
 * bookings. See docs/manual-payments.md.
 *
 * - `submitManualPayment`: the customer sent money to one of the `paymentReceivers` and gives the reference number and
 *   a screenshot (uploaded to Storage under `paymentProofs/{uid}/…` first, see storage.rules).
 * - `reviewManualPayment`: staff approve it (the order or booking becomes Paid) or reject it with a reason (the
 *   customer can send it again, up to MAX_ATTEMPTS times).
 * - `chooseOnsitePayment`: the customer will pay a confirmed booking on site, when the quote allows it.
 * - `recordOnsitePayment`: staff record the money they received on site, optionally completing the booking too.
 *
 * As with PayMongo, the app never writes `payment` itself (firestore.rules); only these functions do. Refunds of
 * transfers and on-site payments are recorded by `refundPayment` in payments.ts.
 */
import { DocumentData, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './app.js';
import {
  PAYMONGO_SECRET_KEY,
  collectionOf,
  docId,
  expireSession,
  kindOf,
  methodLabel,
  peso,
  proofImageOk,
  requireCustomer,
  requireStaff,
  stageEvent,
} from './payment-common.js';
import { trySendInvoice } from './invoices.js';
import { MAIL_SECRETS } from './mail.js';

/** How many times a customer may send a proof for one order or booking (rejected ones included). */
const MAX_ATTEMPTS = 5;
/** Mirrors SERVICE_MAX_PRICE in the app: the largest amount staff can record. */
const MAX_AMOUNT = 10_000_000;
const REFERENCE = /^[A-Za-z0-9-]{4,40}$/;
const ONSITE_METHODS = ['cash', 'gcash', 'bank', 'card'] as const;
/**
 * A transfer can be dated from midnight (Philippine time) `TRANSFER_DAYS_BEFORE` days before the payment became due,
 * up to `TRANSFER_WINDOW_DAYS` days after it. Mirrored in core/payments/manual-payments.ts.
 */
const TRANSFER_WINDOW_DAYS = 3;
const TRANSFER_DAYS_BEFORE = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Philippine time is UTC+8 all year. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
/** Slack for clock differences and the minute the app's date picker rounds to. */
const CLOCK_GRACE_MS = 10 * 60 * 1000;

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function amountOf(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw new HttpsError('invalid-argument', 'Enter a valid amount.');
  }
  return Math.round(amount * 100) / 100;
}

/** When the customer says they sent it, as a time; checked against the payment's window in `checkSentAt`. */
function sentAtOf(value: unknown): Timestamp {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) {
    throw new HttpsError('invalid-argument', 'Enter when you sent the payment.');
  }
  return Timestamp.fromMillis(time);
}

/** Not in the future, and inside the transfer window around when the payment became due (if known). */
function checkSentAt(sentAt: Timestamp, dueSince: Timestamp | undefined): void {
  const time = sentAt.toMillis();
  const start = dueSince?.toMillis();
  const earliest =
    start === undefined
      ? undefined
      : Math.floor((start + MANILA_OFFSET_MS) / DAY_MS) * DAY_MS -
        MANILA_OFFSET_MS -
        TRANSFER_DAYS_BEFORE * DAY_MS;
  const tooEarly = earliest !== undefined && time < earliest - CLOCK_GRACE_MS;
  const tooLate =
    time > Date.now() + CLOCK_GRACE_MS ||
    (start !== undefined && time > start + TRANSFER_WINDOW_DAYS * DAY_MS + CLOCK_GRACE_MS);
  if (tooEarly || tooLate) {
    throw new HttpsError(
      'invalid-argument',
      'That date is outside the payment window. Please check the date and time you sent it, or message us.',
    );
  }
}

/** `manualReferences` id: one per receiver and reference number, so the same transfer can't pay twice. */
function referenceKey(receiverId: string, reference: string): string {
  return `${receiverId}_${reference.toUpperCase()}`;
}

/** What the customer paid into, copied onto the payment so later edits of the receiver don't change it. */
function receiverSnapshot(receiver: DocumentData): Record<string, string> {
  return {
    type: receiver['type'] === 'bank' ? 'bank' : 'gcash',
    label: String(receiver['label'] ?? ''),
    bankName: receiver['type'] === 'bank' ? String(receiver['bankName'] ?? '') : '',
    accountName: String(receiver['accountName'] ?? ''),
    accountNumber: String(receiver['accountNumber'] ?? ''),
  };
}

/** `gcash`, or `bank:BPI`: what `payment.method` holds for an approved transfer. */
function transferMethod(receiver: DocumentData | undefined): string {
  return receiver?.['type'] === 'bank' ? `bank:${receiver['bankName'] || 'Bank'}` : 'gcash';
}

/** The submission fields kept in `payment.manual.history` when a new proof replaces a rejected one. */
function pastAttempt(manual: DocumentData): DocumentData {
  const { history: _history, state: _state, ...attempt } = manual;
  return attempt;
}

/** Customer: records the transfer they made, for staff to check. */
export const submitManualPayment = onCall({ secrets: [PAYMONGO_SECRET_KEY] }, async (req) => {
  const customer = await requireCustomer(req);
  const kind = kindOf(req.data?.kind);
  const id = docId(req.data?.id);
  const receiverId = docId(req.data?.receiverId);
  const referenceNumber = text(req.data?.referenceNumber, 60).replace(/\s+/g, '');
  if (!REFERENCE.test(referenceNumber)) {
    throw new HttpsError(
      'invalid-argument',
      'Enter the reference number exactly as shown on your receipt.',
    );
  }
  const amountSent = amountOf(req.data?.amountSent);
  const sentAt = sentAtOf(req.data?.sentAt);
  const proofPath = text(req.data?.proofPath, 300);
  if (
    !proofPath.startsWith(`paymentProofs/${customer.uid}/${kind}-${id}/`) ||
    proofPath.includes('..')
  ) {
    throw new HttpsError('invalid-argument', 'Please attach the screenshot again.');
  }
  if (!(await proofImageOk(proofPath))) {
    throw new HttpsError(
      'invalid-argument',
      'Please attach the screenshot again (JPG, PNG or WebP, up to 5 MB).',
    );
  }

  const ref = db.doc(`${collectionOf(kind)}/${id}`);
  const receiverRef = db.doc(`paymentReceivers/${receiverId}`);
  const referenceRef = db.doc(`manualReferences/${referenceKey(receiverId, referenceNumber)}`);
  let openSession: string | null = null;

  await db.runTransaction(async (tx) => {
    const [snap, receiver, used] = await tx.getAll(ref, receiverRef, referenceRef);
    if (!snap.exists || snap.get('customerId') !== customer.uid) {
      throw new HttpsError('not-found', `This ${kind} could not be found.`);
    }
    const payment = (snap.get('payment') as DocumentData | undefined) ?? {};
    const manual = payment['manual'] as DocumentData | undefined;
    let due: number;
    if (kind === 'order') {
      if (
        snap.get('status') !== 'Pending' ||
        payment['provider'] !== 'manual' ||
        payment['status'] !== 'Unpaid'
      ) {
        throw new HttpsError('failed-precondition', 'This order is not waiting for a transfer.');
      }
      due = Number(payment['amount']) || 0;
      checkSentAt(sentAt, snap.get('createdAt') as Timestamp | undefined);
    } else {
      if (
        snap.get('status') !== 'Confirmed' ||
        payment['status'] === 'Paid' ||
        payment['status'] === 'Refunded'
      ) {
        throw new HttpsError('failed-precondition', 'This booking is not waiting for payment.');
      }
      due = Number(snap.get('quote.amount')) || 0;
      checkSentAt(sentAt, snap.get('quote.quotedAt') as Timestamp | undefined);
    }
    if (!(due > 0)) throw new HttpsError('failed-precondition', 'There is no amount to pay yet.');
    // The amount is fixed in the app; a different one means an old app or a tampered request.
    if (Math.abs(amountSent - due) > 0.009) {
      throw new HttpsError('invalid-argument', `Please send exactly ${peso(due)}.`);
    }
    if (manual?.['state'] === 'submitted') {
      throw new HttpsError('failed-precondition', 'Your payment is already being checked.');
    }
    const history = Array.isArray(manual?.['history']) ? (manual['history'] as DocumentData[]) : [];
    if (manual?.['state'] === 'rejected') history.push(pastAttempt(manual));
    if (history.length >= MAX_ATTEMPTS) {
      throw new HttpsError(
        'resource-exhausted',
        'Too many attempts. Please message us so we can help.',
      );
    }
    if (!receiver.exists || receiver.get('isActive') === false) {
      throw new HttpsError(
        'failed-precondition',
        'This account no longer takes payments. Please choose another one.',
      );
    }
    if (used.exists) {
      throw new HttpsError(
        'already-exists',
        'This reference number was already used for another payment.',
      );
    }
    if (payment['provider'] === 'paymongo' && typeof payment['checkoutSessionId'] === 'string') {
      openSession = payment['checkoutSessionId'];
    }

    tx.create(referenceRef, {
      kind,
      targetId: id,
      customerId: customer.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(ref, {
      payment: {
        provider: 'manual',
        status: 'Unpaid',
        amount: due,
        manual: {
          state: 'submitted',
          receiverId,
          receiver: receiverSnapshot(receiver.data()!),
          referenceNumber,
          amountSent,
          sentAt,
          proofPath,
          submittedAt: FieldValue.serverTimestamp(),
          ...(history.length ? { history } : {}),
        },
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (kind === 'booking') {
      stageEvent(
        tx,
        snap.get('conversationId'),
        `Sent ${peso(amountSent)} by ${methodLabel(transferMethod(receiver.data()))} (ref ${referenceNumber}). Waiting for our team to check it.`,
        { id: customer.uid, name: customer.name, role: 'customer' },
      );
    }
  });

  // A booking that had an open PayMongo checkout switched to a transfer: close it so it can't be paid twice.
  if (openSession) await expireSession(openSession);
  logger.info('Transfer proof submitted', { kind, id, receiverId, referenceNumber });
  return { ok: true };
});

/**
 * Staff: approves the transfer (the order or booking is then Paid) or rejects it with a reason. With `sendInvoice`, an
 * approval also emails the invoice; if that fails the approval stands and `invoiceError` says why.
 */
export const reviewManualPayment = onCall({ secrets: MAIL_SECRETS }, async (req) => {
  const staff = await requireStaff(req);
  const kind = kindOf(req.data?.kind);
  const id = docId(req.data?.id);
  const decision = req.data?.decision;
  if (decision !== 'approve' && decision !== 'reject')
    throw new HttpsError('invalid-argument', 'Approve or reject.');
  const reason = text(req.data?.reason, 200);
  if (decision === 'reject' && !reason)
    throw new HttpsError('invalid-argument', 'Tell the customer what is wrong.');
  const ref = db.doc(`${collectionOf(kind)}/${id}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'This could not be found.');
    const payment = (snap.get('payment') as DocumentData | undefined) ?? {};
    const manual = payment['manual'] as DocumentData | undefined;
    if (payment['status'] !== 'Unpaid' || manual?.['state'] !== 'submitted') {
      throw new HttpsError('failed-precondition', 'There is no payment waiting to be checked.');
    }
    const reviewed = {
      'payment.manual.reviewedAt': FieldValue.serverTimestamp(),
      'payment.manual.reviewedBy': staff.uid,
      'payment.manual.reviewedByName': staff.name,
      updatedAt: FieldValue.serverTimestamp(),
    };
    const amount = Number(payment['amount']) || 0;
    const method = transferMethod(manual['receiver']);
    const sender = { id: staff.uid, name: staff.name, role: staff.role };

    if (decision === 'approve') {
      const confirmed = kind === 'booking' && snap.get('status') === 'Confirmed';
      tx.update(ref, {
        ...reviewed,
        'payment.status': 'Paid',
        'payment.paidAt': FieldValue.serverTimestamp(),
        'payment.method': method,
        'payment.paymentId': String(manual['referenceNumber'] ?? ''),
        'payment.manual.state': 'approved',
        ...(confirmed ? { status: 'Paid' } : {}),
      });
      if (kind === 'booking') {
        stageEvent(
          tx,
          snap.get('conversationId'),
          `Payment of ${peso(amount)} by ${methodLabel(method)} (ref ${manual['referenceNumber']}) verified. Your booking is confirmed. Thank you!`,
          sender,
        );
      }
    } else {
      // Free the reference number: it may have been mistyped, and the customer sends it again.
      tx.delete(
        db.doc(
          `manualReferences/${referenceKey(String(manual['receiverId']), String(manual['referenceNumber']))}`,
        ),
      );
      tx.update(ref, {
        ...reviewed,
        'payment.manual.state': 'rejected',
        'payment.manual.rejectReason': reason,
      });
      if (kind === 'booking') {
        stageEvent(
          tx,
          snap.get('conversationId'),
          `We couldn't verify your payment (ref ${manual['referenceNumber']}): ${reason} Please check it and send it again.`,
          sender,
        );
      }
    }
  });
  logger.info('Transfer reviewed', { kind, id, decision, by: staff.uid });
  if (decision === 'approve' && req.data?.sendInvoice === true) {
    const invoiceError = await trySendInvoice(kind, id, { id: staff.uid, name: staff.name, role: staff.role });
    return { ok: true, invoiceError };
  }
  return { ok: true };
});

/** Customer: will pay a confirmed booking's quote on site (only when staff allowed it on the quote). */
export const chooseOnsitePayment = onCall({ secrets: [PAYMONGO_SECRET_KEY] }, async (req) => {
  const customer = await requireCustomer(req);
  const id = docId(req.data?.bookingId);
  const ref = db.doc(`bookings/${id}`);
  let openSession: string | null = null;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('customerId') !== customer.uid) {
      throw new HttpsError('not-found', 'This booking could not be found.');
    }
    const payment = (snap.get('payment') as DocumentData | undefined) ?? {};
    if (
      snap.get('status') !== 'Confirmed' ||
      payment['status'] === 'Paid' ||
      payment['status'] === 'Refunded'
    ) {
      throw new HttpsError('failed-precondition', 'This booking is not waiting for payment.');
    }
    if (snap.get('quote.allowOnsite') !== true) {
      throw new HttpsError('failed-precondition', 'This quotation has to be paid in advance.');
    }
    if (payment['manual']?.['state'] === 'submitted') {
      throw new HttpsError(
        'failed-precondition',
        'Your transfer is being checked. Please wait for our team.',
      );
    }
    if (payment['provider'] === 'onsite') return;
    const amount = Number(snap.get('quote.amount')) || 0;
    if (payment['provider'] === 'paymongo' && typeof payment['checkoutSessionId'] === 'string') {
      openSession = payment['checkoutSessionId'];
    }
    tx.update(ref, {
      payment: { provider: 'onsite', status: 'Unpaid', amount },
      updatedAt: FieldValue.serverTimestamp(),
    });
    stageEvent(tx, snap.get('conversationId'), `I'll pay ${peso(amount)} on site.`, {
      id: customer.uid,
      name: customer.name,
      role: 'customer',
    });
  });

  if (openSession) await expireSession(openSession);
  return { ok: true };
});

/**
 * Staff: records a payment received on site for a confirmed booking, and with `complete` also completes it. With
 * `sendInvoice` it also emails the invoice (as `reviewManualPayment`).
 */
export const recordOnsitePayment = onCall({ secrets: [PAYMONGO_SECRET_KEY, ...MAIL_SECRETS] }, async (req) => {
  const staff = await requireStaff(req);
  const id = docId(req.data?.bookingId);
  const method = req.data?.method as (typeof ONSITE_METHODS)[number];
  if (!ONSITE_METHODS.includes(method))
    throw new HttpsError('invalid-argument', 'Choose how the customer paid.');
  const amount = amountOf(req.data?.amount);
  const receiptNumber = text(req.data?.receiptNumber, 40);
  const complete = req.data?.complete === true;
  const ref = db.doc(`bookings/${id}`);
  let openSession: string | null = null;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'This booking could not be found.');
    const payment = (snap.get('payment') as DocumentData | undefined) ?? {};
    if (
      snap.get('status') !== 'Confirmed' ||
      payment['status'] === 'Paid' ||
      payment['status'] === 'Refunded'
    ) {
      throw new HttpsError('failed-precondition', 'This booking is not waiting for payment.');
    }
    if (payment['manual']?.['state'] === 'submitted') {
      throw new HttpsError(
        'failed-precondition',
        'The customer sent a transfer for this booking. Check it first.',
      );
    }
    if (payment['provider'] === 'paymongo' && typeof payment['checkoutSessionId'] === 'string') {
      openSession = payment['checkoutSessionId'];
    }
    tx.update(ref, {
      payment: {
        provider: 'onsite',
        status: 'Paid',
        amount,
        method,
        paymentId: receiptNumber,
        paidAt: FieldValue.serverTimestamp(),
        onsite: {
          method,
          receiptNumber,
          recordedBy: staff.uid,
          recordedByName: staff.name,
          recordedAt: FieldValue.serverTimestamp(),
        },
      },
      status: complete ? 'Completed' : 'Paid',
      updatedAt: FieldValue.serverTimestamp(),
    });
    stageEvent(
      tx,
      snap.get('conversationId'),
      `Payment of ${peso(amount)} received on site (${methodLabel(method)}${receiptNumber ? `, receipt ${receiptNumber}` : ''}).${
        complete ? ' The service is completed. Thank you!' : ' Your booking is confirmed.'
      }`,
      { id: staff.uid, name: staff.name, role: staff.role },
    );
  });

  if (openSession) await expireSession(openSession);
  logger.info('On-site payment recorded', {
    bookingId: id,
    amount,
    method,
    complete,
    by: staff.uid,
  });
  if (req.data?.sendInvoice === true) {
    const invoiceError = await trySendInvoice('booking', id, { id: staff.uid, name: staff.name, role: staff.role });
    return { ok: true, invoiceError };
  }
  return { ok: true };
});

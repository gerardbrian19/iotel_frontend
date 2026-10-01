/**
 * Payments through PayMongo (hosted Checkout Sessions), for orders and service bookings. See docs/paymongo-setup.md.
 *
 * - `createOrderCheckout`: prices the cart from `products`, writes the order (Pending, payment Unpaid) and opens a
 *   PayMongo checkout for it. Customers can't create orders themselves (firestore.rules), so the amounts are always
 *   the server's.
 * - `createBookingCheckout`: opens (or reuses) a checkout for a confirmed booking's quote.
 * - `paymongoWebhook`: PayMongo calls it when a checkout is paid; it is the only thing that marks a payment Paid.
 * - `refundPayment`: staff refund a paid order or booking, which also cancels it (and restocks a processing order).
 * - `expireUnpaidOrders`: cancels orders still unpaid after an hour; the update triggers then expire their checkouts
 *   (the same happens when a customer or staff cancel an unpaid order or booking).
 *
 * Test and live mode differ only in the secrets: PAYMONGO_SECRET_KEY (sk_test_… / sk_live_…) and the webhook's
 * PAYMONGO_WEBHOOK_SECRET, printed by `npm run paymongo:webhook` when the webhook is registered.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { DocumentData, DocumentReference, FieldValue, Timestamp, Transaction } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineSecret, defineString } from 'firebase-functions/params';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { CallableRequest, HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from './app.js';
import { TWO_STEP_SIGN_IN } from './flags.js';

const PAYMONGO_SECRET_KEY = defineSecret('PAYMONGO_SECRET_KEY');
const PAYMONGO_WEBHOOK_SECRET = defineSecret('PAYMONGO_WEBHOOK_SECRET');
// Where PayMongo may send the customer back to, comma-separated (functions/.env).
const APP_ORIGINS = defineString('APP_ORIGINS', {
  default: 'http://localhost:4200',
  description: 'Origins of the IOTEL web app, comma-separated (e.g. http://localhost:4200,https://iotel-e9a72.web.app)',
});

const API = 'https://api.paymongo.com/v1';
/** Mirrors SHIPPING_FEE in src/app/core/services/cart.service.ts. */
const SHIPPING_FEE = 250;
const ESTIMATED_DELIVERY_DAYS = 5;
/** Unpaid orders are cancelled after this long (mirrored in the app's order hints). */
const UNPAID_ORDER_TTL_MS = 60 * 60 * 1000;
const MAX_ORDER_LINES = 50;
/** What the PayMongo checkout page offers. Add 'dob', 'billease', … here once they are enabled on the account. */
const PAYMENT_METHOD_TYPES = ['card', 'gcash', 'paymaya', 'grab_pay', 'qrph'];

type Kind = 'order' | 'booking';

interface PaymongoResource<A> {
  id: string;
  type: string;
  attributes: A;
}

interface PaymentAttributes {
  amount: number;
  status: string;
  source?: { type?: string } | null;
}

interface CheckoutSessionAttributes {
  checkout_url: string;
  status: string;
  metadata?: Record<string, string> | null;
  payment_method_used?: string | null;
  payments?: PaymongoResource<PaymentAttributes>[];
}

interface WebhookEvent {
  id: string;
  attributes: { type: string; livemode: boolean; data: PaymongoResource<CheckoutSessionAttributes> };
}

// ── PayMongo API ─────────────────────────────────────────────────────────────

async function paymongo<A>(method: 'GET' | 'POST', path: string, attributes?: object): Promise<PaymongoResource<A>> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${PAYMONGO_SECRET_KEY.value()}:`).toString('base64')}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: attributes ? JSON.stringify({ data: { attributes } }) : undefined,
  });
  const body = (await res.json().catch(() => null)) as { data?: PaymongoResource<A>; errors?: unknown } | null;
  if (!res.ok || !body?.data) {
    logger.error('PayMongo request failed', { method, path, status: res.status, errors: body?.errors });
    throw new HttpsError('unavailable', "We couldn't reach the payment provider. Please try again in a minute.");
  }
  return body.data;
}

/** PayMongo amounts are in centavos. */
function centavos(php: number): number {
  return Math.round(php * 100);
}

/** Closes a checkout so it can't be paid any more. Best effort: an already expired or paid session just logs. */
async function expireSession(sessionId: string): Promise<void> {
  try {
    await paymongo('POST', `/checkout_sessions/${sessionId}/expire`);
  } catch {
    logger.warn('Could not expire checkout session', { sessionId });
  }
}

// ── Callers ──────────────────────────────────────────────────────────────────

/** A customer whose session passed the emailed-code step (the same check as `secondStep()` in firestore.rules). */
async function requireCustomer(req: CallableRequest): Promise<{ uid: string; name: string; email: string }> {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in again.');
  const { uid, token } = req.auth;
  if (TWO_STEP_SIGN_IN && token['otpAuthTime'] !== token.auth_time) throw new HttpsError('unauthenticated', 'Please sign in again.');
  const profile = await db.doc(`users/${uid}`).get();
  if (profile.get('role') !== 'customer') throw new HttpsError('permission-denied', 'Only customers can pay here.');
  return { uid, name: String(profile.get('name') ?? ''), email: String(profile.get('email') ?? token.email ?? '') };
}

/** Staff or an admin, signed in with their authenticator app (as `isStaffOrAdmin()` in firestore.rules). */
async function requireStaff(req: CallableRequest): Promise<{ uid: string; name: string; role: string }> {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in again.');
  if (TWO_STEP_SIGN_IN && req.auth.token.firebase?.sign_in_second_factor !== 'totp') {
    throw new HttpsError('permission-denied', 'Sign in with your authenticator app first.');
  }
  const profile = await db.doc(`users/${req.auth.uid}`).get();
  const role = profile.get('role');
  if (role !== 'staff' && role !== 'admin') throw new HttpsError('permission-denied', 'Only staff can do this.');
  return { uid: req.auth.uid, name: String(profile.get('name') ?? ''), role };
}

/** The app origin PayMongo sends the customer back to; only the configured ones are accepted. */
function appOrigin(value: unknown): string {
  const allowed = APP_ORIGINS.value()
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const origin = typeof value === 'string' ? value.replace(/\/$/, '') : '';
  if (!allowed.includes(origin)) {
    logger.warn('Checkout from an origin that is not in APP_ORIGINS', { origin });
    throw new HttpsError('invalid-argument', 'Payments cannot be started from this site.');
  }
  return origin;
}

function docId(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 200 || value.includes('/')) {
    throw new HttpsError('invalid-argument', 'Missing or invalid id.');
  }
  return value;
}

// ── Orders ───────────────────────────────────────────────────────────────────

const ADDRESS_LIMITS = { fullName: 60, addressLine: 200, city: 80, province: 80, zip: 10, mobile: 20 } as const;
type ShippingAddress = Record<keyof typeof ADDRESS_LIMITS, string>;

function shippingAddress(value: unknown): ShippingAddress {
  const input = (value ?? {}) as Record<string, unknown>;
  const address = {} as ShippingAddress;
  for (const [key, max] of Object.entries(ADDRESS_LIMITS) as [keyof ShippingAddress, number][]) {
    const field = typeof input[key] === 'string' ? (input[key] as string).trim() : '';
    if (!field || field.length > max) throw new HttpsError('invalid-argument', 'Please check your shipping address.');
    address[key] = field;
  }
  return address;
}

/** Quantity per product id, from the cart lines the client sent. */
function cartLines(value: unknown): Map<string, number> {
  if (!Array.isArray(value) || value.length === 0) throw new HttpsError('invalid-argument', 'Your cart is empty.');
  if (value.length > MAX_ORDER_LINES) throw new HttpsError('invalid-argument', 'Too many items in one order.');
  const lines = new Map<string, number>();
  for (const line of value as { productId?: unknown; qty?: unknown }[]) {
    const id = docId(line?.productId);
    const qty = line?.qty;
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > 999) {
      throw new HttpsError('invalid-argument', 'Invalid quantity in your cart.');
    }
    lines.set(id, (lines.get(id) ?? 0) + qty);
  }
  return lines;
}

function priceOf(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function orderCode(number: number): string {
  return `ORD-${String(number).padStart(4, '0')}`;
}

/** `YYYY-MM-DD` in the Philippines, `days` from now. */
function manilaDateKey(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

/** Customer: turns the cart into an order and a PayMongo checkout. Returns where to send the customer. */
export const createOrderCheckout = onCall({ secrets: [PAYMONGO_SECRET_KEY] }, async (req) => {
  const customer = await requireCustomer(req);
  const lines = cartLines(req.data?.items);
  const address = shippingAddress(req.data?.address);
  const origin = appOrigin(req.data?.origin);

  const orderRef = db.collection('orders').doc();
  const counterRef = db.doc('counters/orders');
  const { code, items, total } = await db.runTransaction(async (tx) => {
    const [counter, ...products] = await tx.getAll(
      counterRef,
      ...[...lines.keys()].map((id) => db.doc(`products/${id}`)),
    );
    // Same checks as `cartProblems()` in the app, against the live documents.
    const items = products.map((snap) => {
      const qty = lines.get(snap.id)!;
      const name = String(snap.get('name') ?? snap.id);
      const price = snap.exists ? priceOf(snap.get('srp')) : null;
      const stock = Math.max(0, Math.floor(Number(snap.get('stock')) || 0));
      if (!snap.exists || snap.get('isActive') === false || price === null) {
        throw new HttpsError('failed-precondition', `${name} is no longer available.`);
      }
      if (stock < qty) {
        throw new HttpsError(
          'failed-precondition',
          stock ? `Only ${stock} of ${name} left in stock.` : `${name} is out of stock.`,
        );
      }
      return { productId: snap.id, name, price, qty, imageUrl: String(snap.get('imageUrl') ?? '') };
    });
    const subtotal = Math.round(items.reduce((sum, item) => sum + item.price * item.qty, 0) * 100) / 100;
    const total = subtotal + SHIPPING_FEE;
    const number = (counter.exists ? Number(counter.get('last')) || 0 : 0) + 1;

    tx.set(counterRef, { last: number });
    tx.set(orderRef, {
      number,
      customerId: customer.uid,
      customerName: customer.name,
      customerEmail: customer.email,
      items,
      subtotal,
      shippingFee: SHIPPING_FEE,
      total,
      address,
      payment: { provider: 'paymongo', status: 'Unpaid', amount: total },
      status: 'Pending',
      estimatedDelivery: manilaDateKey(ESTIMATED_DELIVERY_DAYS),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { code: orderCode(number), items, total };
  });

  const back = `${origin}/customer/orders/${orderRef.id}/confirmation`;
  let session: PaymongoResource<CheckoutSessionAttributes>;
  try {
    session = await paymongo<CheckoutSessionAttributes>('POST', '/checkout_sessions', {
      line_items: [
        ...items.map((item) => ({
          currency: 'PHP',
          amount: centavos(item.price),
          name: item.name.slice(0, 255),
          quantity: item.qty,
        })),
        { currency: 'PHP', amount: centavos(SHIPPING_FEE), name: 'Shipping', quantity: 1 },
      ],
      payment_method_types: PAYMENT_METHOD_TYPES,
      description: `IOTEL order ${code}`,
      reference_number: code,
      billing: { name: customer.name, email: customer.email },
      send_email_receipt: false,
      show_description: true,
      show_line_items: true,
      success_url: `${back}?payment=success`,
      cancel_url: `${back}?payment=cancelled`,
      metadata: { kind: 'order', id: orderRef.id },
    });
  } catch (err) {
    await orderRef.update({
      status: 'Cancelled',
      cancelledBy: 'system',
      cancelReason: 'The payment could not be started.',
      cancelledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw err;
  }

  await orderRef.update({
    'payment.checkoutSessionId': session.id,
    'payment.checkoutUrl': session.attributes.checkout_url,
    updatedAt: FieldValue.serverTimestamp(),
  });
  logger.info('Order checkout created', { orderId: orderRef.id, code, total, sessionId: session.id });
  return { orderId: orderRef.id, checkoutUrl: session.attributes.checkout_url };
});

/** Cancels orders that were never paid, so they don't sit in the staff queue. */
export const expireUnpaidOrders = onSchedule(
  { schedule: 'every 15 minutes', timeZone: 'Asia/Manila' },
  async () => {
    const cutoff = Date.now() - UNPAID_ORDER_TTL_MS;
    // Only `status` is queried so no composite index is needed; there are few pending orders at any time.
    const pending = await db.collection('orders').where('status', '==', 'Pending').get();
    const stale = pending.docs.filter((snap) => {
      const createdAt = snap.get('createdAt') as Timestamp | undefined;
      return snap.get('payment.status') === 'Unpaid' && !!createdAt && createdAt.toMillis() < cutoff;
    });
    for (const snap of stale) {
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(snap.ref);
        if (fresh.get('status') !== 'Pending' || fresh.get('payment.status') !== 'Unpaid') return;
        tx.update(snap.ref, {
          status: 'Cancelled',
          cancelledBy: 'system',
          cancelReason: 'The payment was not completed in time.',
          cancelledAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    }
    if (stale.length) logger.info('Cancelled unpaid orders', { count: stale.length });
  },
);

/** Closes the checkout of an order or booking that was just cancelled before it was paid. */
function expireCheckoutOnCancel(before: DocumentData | undefined, after: DocumentData | undefined): Promise<void> {
  const sessionId = after?.['payment']?.['checkoutSessionId'];
  if (
    before?.['status'] !== 'Cancelled' &&
    after?.['status'] === 'Cancelled' &&
    after?.['payment']?.['status'] === 'Unpaid' &&
    typeof sessionId === 'string'
  ) {
    return expireSession(sessionId);
  }
  return Promise.resolve();
}

export const onOrderCancelled = onDocumentUpdated(
  { document: 'orders/{orderId}', secrets: [PAYMONGO_SECRET_KEY] },
  (event) => expireCheckoutOnCancel(event.data?.before.data(), event.data?.after.data()),
);

export const onBookingCancelled = onDocumentUpdated(
  { document: 'bookings/{bookingId}', secrets: [PAYMONGO_SECRET_KEY] },
  (event) => expireCheckoutOnCancel(event.data?.before.data(), event.data?.after.data()),
);

// ── Bookings ─────────────────────────────────────────────────────────────────

/** Customer: a checkout for the confirmed quote. Reuses the open one unless the quote changed since. */
export const createBookingCheckout = onCall({ secrets: [PAYMONGO_SECRET_KEY] }, async (req) => {
  const customer = await requireCustomer(req);
  const bookingId = docId(req.data?.bookingId);
  const origin = appOrigin(req.data?.origin);
  const ref = db.doc(`bookings/${bookingId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.get('customerId') !== customer.uid) {
    throw new HttpsError('not-found', 'This booking could not be found.');
  }
  if (snap.get('status') !== 'Confirmed') throw new HttpsError('failed-precondition', 'This booking is not waiting for payment.');
  const amount = Number(snap.get('quote.amount'));
  if (!(amount > 0)) throw new HttpsError('failed-precondition', 'This booking has no confirmed amount yet.');
  const payment = snap.get('payment') as DocumentData | undefined;
  if (payment?.['status'] === 'Paid') throw new HttpsError('failed-precondition', 'This booking is already paid.');

  const previous = typeof payment?.['checkoutSessionId'] === 'string' ? (payment['checkoutSessionId'] as string) : null;
  if (previous) {
    const open = await paymongo<CheckoutSessionAttributes>('GET', `/checkout_sessions/${previous}`);
    if (open.attributes.status === 'active') {
      if (payment?.['amount'] === amount) return { checkoutUrl: open.attributes.checkout_url };
      await expireSession(previous);
    }
  }

  const serviceName = String(snap.get('serviceName') ?? 'Service');
  const back = `${origin}/customer/services?booking=${bookingId}`;
  const session = await paymongo<CheckoutSessionAttributes>('POST', '/checkout_sessions', {
    line_items: [{ currency: 'PHP', amount: centavos(amount), name: serviceName.slice(0, 255), quantity: 1 }],
    payment_method_types: PAYMENT_METHOD_TYPES,
    description: `IOTEL service booking: ${serviceName}`,
    reference_number: bookingId,
    billing: { name: customer.name, email: customer.email },
    send_email_receipt: false,
    show_description: true,
    show_line_items: true,
    success_url: `${back}&payment=success`,
    cancel_url: `${back}&payment=cancelled`,
    metadata: { kind: 'booking', id: bookingId },
  });

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (fresh.get('status') !== 'Confirmed' || fresh.get('payment.status') === 'Paid') {
      throw new HttpsError('failed-precondition', 'This booking changed. Please refresh and try again.');
    }
    tx.update(ref, {
      payment: {
        provider: 'paymongo',
        status: 'Unpaid',
        amount,
        checkoutSessionId: session.id,
        checkoutUrl: session.attributes.checkout_url,
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { checkoutUrl: session.attributes.checkout_url };
});

/** Adds an `event` line to a booking's chat inside `tx`, the way the app's MessageService does. */
function stageEvent(
  tx: Transaction,
  conversationId: unknown,
  content: string,
  sender: { id: string; name: string; role: string },
): void {
  if (typeof conversationId !== 'string' || !conversationId) return;
  const conversation = db.doc(`conversations/${conversationId}`);
  tx.set(conversation.collection('messages').doc(), {
    senderId: sender.id,
    senderName: sender.name,
    senderRole: sender.role,
    kind: 'event',
    content,
    sentAt: FieldValue.serverTimestamp(),
  });
  tx.update(conversation, {
    lastMessage: content,
    lastMessageAt: FieldValue.serverTimestamp(),
    customerUnread: FieldValue.increment(1),
    // Staff wrote it themselves; a system line is news to both sides.
    ...(sender.id === SYSTEM_SENDER.id ? { staffUnread: FieldValue.increment(1) } : {}),
  });
}

const SYSTEM_SENDER = { id: 'system', name: 'IOTEL', role: 'staff' };

const METHOD_LABELS: Record<string, string> = {
  card: 'card',
  gcash: 'GCash',
  paymaya: 'Maya',
  grab_pay: 'GrabPay',
  qrph: 'QR Ph',
  dob: 'online banking',
  dob_ubp: 'online banking',
  billease: 'BillEase',
};

// ── Webhook ──────────────────────────────────────────────────────────────────

/** `Paymongo-Signature: t=<time>,te=<test sig>,li=<live sig>`, an HMAC-SHA256 of `<time>.<raw body>`. */
function validSignature(header: string | undefined, rawBody: Buffer, livemode: boolean): boolean {
  const parts = new Map(
    (header ?? '').split(',').map((part) => {
      const [key, ...value] = part.trim().split('=');
      return [key, value.join('=')] as const;
    }),
  );
  const time = parts.get('t');
  const given = parts.get(livemode ? 'li' : 'te');
  if (!time || !given) return false;
  const expected = createHmac('sha256', PAYMONGO_WEBHOOK_SECRET.value())
    .update(`${time}.${rawBody.toString('utf8')}`)
    .digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(given, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Records a paid checkout on its order or booking. Each event is applied once (`paymongoEvents/{eventId}`). */
async function applyPaidCheckout(event: WebhookEvent): Promise<void> {
  const session = event.attributes.data;
  const kind = session.attributes.metadata?.['kind'] as Kind | undefined;
  const id = session.attributes.metadata?.['id'];
  if ((kind !== 'order' && kind !== 'booking') || !id) {
    logger.warn('Paid checkout without IOTEL metadata', { eventId: event.id, sessionId: session.id });
    return;
  }
  const payment = session.attributes.payments?.[0];
  const method = session.attributes.payment_method_used || payment?.attributes.source?.type || '';
  const paidAmount = payment ? payment.attributes.amount / 100 : null;
  const ref: DocumentReference = db.doc(`${kind === 'order' ? 'orders' : 'bookings'}/${id}`);
  const eventRef = db.doc(`paymongoEvents/${event.id}`);

  await db.runTransaction(async (tx) => {
    const [seen, snap] = await Promise.all([tx.get(eventRef), tx.get(ref)]);
    if (seen.exists) return;
    tx.create(eventRef, {
      type: event.attributes.type,
      kind,
      targetId: id,
      sessionId: session.id,
      paymentId: payment?.id ?? null,
      receivedAt: FieldValue.serverTimestamp(),
    });
    if (!snap.exists) {
      logger.error('Paid checkout for a missing document', { kind, id, sessionId: session.id });
      return;
    }
    if (snap.get('payment.status') === 'Paid') return;
    if (paidAmount !== null && paidAmount !== Number(snap.get('payment.amount'))) {
      logger.warn('Paid amount differs from the amount due', { kind, id, paidAmount, due: snap.get('payment.amount') });
    }
    // A cancelled order or booking (paid after it expired) still records the money, so staff see they must refund it.
    const updates: Record<string, unknown> = {
      'payment.status': 'Paid',
      'payment.paidAt': FieldValue.serverTimestamp(),
      'payment.paymentId': payment?.id ?? '',
      'payment.method': method,
      'payment.checkoutSessionId': session.id,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (kind === 'booking') {
      const confirmed = snap.get('status') === 'Confirmed';
      if (confirmed) updates['status'] = 'Paid';
      stageEvent(
        tx,
        snap.get('conversationId'),
        confirmed
          ? `Payment received${METHOD_LABELS[method] ? ` via ${METHOD_LABELS[method]}` : ''}. Thank you!`
          : 'A payment was received for this cancelled booking. Our team will refund it.',
        SYSTEM_SENDER,
      );
    }
    tx.update(ref, updates);
  });
  logger.info('Checkout paid', { kind, id, sessionId: session.id, paymentId: payment?.id, method });
}

/** PayMongo → here when a checkout is paid. Register it with `npm run paymongo:webhook`. */
export const paymongoWebhook = onRequest(
  { secrets: [PAYMONGO_WEBHOOK_SECRET], invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }
    const event = (req.body as { data?: WebhookEvent } | undefined)?.data;
    if (!event?.attributes || !validSignature(req.get('paymongo-signature'), req.rawBody, !!event.attributes.livemode)) {
      logger.warn('Webhook with a missing or invalid signature');
      res.status(401).send('Invalid signature');
      return;
    }
    try {
      if (event.attributes.type === 'checkout_session.payment.paid') await applyPaidCheckout(event);
    } catch (err) {
      // A non-2xx answer makes PayMongo retry later.
      logger.error('Webhook handling failed', { eventId: event.id, err });
      res.status(500).send('Error');
      return;
    }
    res.status(200).send('OK');
  },
);

// ── Refunds ──────────────────────────────────────────────────────────────────

/**
 * Staff: refunds a paid order or booking in full and cancels it if it isn't already. A processing order's items go
 * back into stock; a booking's time slot is freed. Shipped or delivered orders and completed bookings are refunded
 * from the PayMongo dashboard instead.
 */
export const refundPayment = onCall({ secrets: [PAYMONGO_SECRET_KEY] }, async (req) => {
  const staff = await requireStaff(req);
  const kind = req.data?.kind as Kind;
  if (kind !== 'order' && kind !== 'booking') throw new HttpsError('invalid-argument', 'Unknown payment.');
  const id = docId(req.data?.id);
  const reason = typeof req.data?.reason === 'string' ? req.data.reason.trim().slice(0, 200) : '';
  const ref = db.doc(`${kind === 'order' ? 'orders' : 'bookings'}/${id}`);

  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'This could not be found.');
  const status = snap.get('status');
  const refundable = kind === 'order' ? ['Pending', 'Processing', 'Cancelled'] : ['Confirmed', 'Paid', 'Cancelled'];
  if (!refundable.includes(status)) {
    throw new HttpsError(
      'failed-precondition',
      `This ${kind} is already ${String(status).toLowerCase()}. Refund it from the PayMongo dashboard if needed.`,
    );
  }
  const paymentId = snap.get('payment.paymentId');
  const amount = Number(snap.get('payment.amount'));
  if (snap.get('payment.status') !== 'Paid' || typeof paymentId !== 'string' || !paymentId || !(amount > 0)) {
    throw new HttpsError('failed-precondition', 'There is no payment to refund.');
  }

  // PayMongo refuses refunds beyond what was paid, so a double click can't refund twice.
  const refund = await paymongo('POST', '/refunds', {
    amount: centavos(amount),
    payment_id: paymentId,
    reason: 'requested_by_customer',
    ...(reason ? { notes: reason } : {}),
  });

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    const current = fresh.get('status');
    // All reads come before any write.
    const restock =
      kind === 'order' && current === 'Processing'
        ? await readStock(tx, (fresh.get('items') as { productId: string; qty: number }[] | undefined) ?? [])
        : [];
    for (const line of restock) {
      if (line.exists) tx.update(line.ref, { stock: line.stock + line.qty });
    }
    const updates: Record<string, unknown> = {
      'payment.status': 'Refunded',
      'payment.refundId': refund.id,
      'payment.refundedAt': FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (current !== 'Cancelled') {
      updates['status'] = 'Cancelled';
      if (kind === 'order') {
        updates['cancelledBy'] = 'staff';
        updates['cancelledAt'] = FieldValue.serverTimestamp();
        if (reason) updates['cancelReason'] = reason;
      } else {
        tx.delete(db.doc(`bookingSlots/${fresh.get('preferredDate')}T${fresh.get('preferredTime')}`));
      }
    }
    if (kind === 'booking') {
      stageEvent(
        tx,
        fresh.get('conversationId'),
        `${current !== 'Cancelled' ? 'Booking cancelled and payment' : 'Payment'} of ₱${amount.toLocaleString('en-PH')} refunded${reason ? `: ${reason}` : '.'}`,
        { id: staff.uid, name: staff.name, role: staff.role },
      );
    }
    tx.update(ref, updates);
  });
  logger.info('Payment refunded', { kind, id, refundId: refund.id, by: staff.uid });
  return { ok: true };
});

/** Current stock of each product in the order, once per product (as `readStock` in the app's OrderService). */
async function readStock(tx: Transaction, items: readonly { productId: string; qty: number }[]) {
  const wanted = new Map<string, number>();
  for (const item of items) wanted.set(item.productId, (wanted.get(item.productId) ?? 0) + item.qty);
  if (!wanted.size) return [];
  const snaps = await tx.getAll(...[...wanted.keys()].map((id) => db.doc(`products/${id}`)));
  return snaps.map((snap) => ({
    ref: snap.ref,
    exists: snap.exists,
    qty: wanted.get(snap.id)!,
    stock: Math.max(0, Math.floor(Number(snap.get('stock')) || 0)),
  }));
}

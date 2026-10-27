/**
 * What the payment functions share: the PayMongo API client, who may call them, the booking chat events, and stock
 * reads. Used by payments.ts (PayMongo) and manual-payments.ts (GCash / bank transfers and on-site payments).
 */
import { FieldValue, Transaction } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { db } from './app.js';
import { TWO_STEP_SIGN_IN } from './flags.js';

export const PAYMONGO_SECRET_KEY = defineSecret('PAYMONGO_SECRET_KEY');

const API = 'https://api.paymongo.com/v1';

export type Kind = 'order' | 'booking';

export interface PaymongoResource<A> {
  id: string;
  type: string;
  attributes: A;
}

export interface PaymentAttributes {
  amount: number;
  status: string;
  source?: { type?: string } | null;
}

export interface CheckoutSessionAttributes {
  checkout_url: string;
  status: string;
  metadata?: Record<string, string> | null;
  payment_method_used?: string | null;
  payments?: PaymongoResource<PaymentAttributes>[];
}

// ── PayMongo API ─────────────────────────────────────────────────────────────

export async function paymongo<A>(
  method: 'GET' | 'POST',
  path: string,
  attributes?: object,
): Promise<PaymongoResource<A>> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${PAYMONGO_SECRET_KEY.value()}:`).toString('base64')}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: attributes ? JSON.stringify({ data: { attributes } }) : undefined,
  });
  const body = (await res.json().catch(() => null)) as {
    data?: PaymongoResource<A>;
    errors?: unknown;
  } | null;
  if (!res.ok || !body?.data) {
    logger.error('PayMongo request failed', {
      method,
      path,
      status: res.status,
      errors: body?.errors,
    });
    throw new HttpsError(
      'unavailable',
      "We couldn't reach the payment provider. Please try again in a minute.",
    );
  }
  return body.data;
}

/** PayMongo amounts are in centavos. */
export function centavos(php: number): number {
  return Math.round(php * 100);
}

/** Closes a checkout so it can't be paid any more. Best effort: an already expired or paid session just logs. */
export async function expireSession(sessionId: string): Promise<void> {
  try {
    await paymongo('POST', `/checkout_sessions/${sessionId}/expire`);
  } catch {
    logger.warn('Could not expire checkout session', { sessionId });
  }
}

// ── Callers ──────────────────────────────────────────────────────────────────

/**
 * A customer whose session passed the second step: the emailed code, or an authenticator app if they set one up (the
 * same check as `secondStep()` in firestore.rules).
 */
export async function requireCustomer(
  req: CallableRequest,
): Promise<{ uid: string; name: string; email: string }> {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in again.');
  const { uid, token } = req.auth;
  const secondStep =
    token['otpAuthTime'] === token.auth_time || token.firebase?.sign_in_second_factor === 'totp';
  if (TWO_STEP_SIGN_IN && !secondStep)
    throw new HttpsError('unauthenticated', 'Please sign in again.');
  const profile = await db.doc(`users/${uid}`).get();
  if (profile.get('role') !== 'customer')
    throw new HttpsError('permission-denied', 'Only customers can pay here.');
  return {
    uid,
    name: String(profile.get('name') ?? ''),
    email: String(profile.get('email') ?? token.email ?? ''),
  };
}

/** Staff or an admin, signed in with their authenticator app (as `isStaffOrAdmin()` in firestore.rules). */
export async function requireStaff(
  req: CallableRequest,
): Promise<{ uid: string; name: string; role: string }> {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in again.');
  if (TWO_STEP_SIGN_IN && req.auth.token.firebase?.sign_in_second_factor !== 'totp') {
    throw new HttpsError('permission-denied', 'Sign in with your authenticator app first.');
  }
  const profile = await db.doc(`users/${req.auth.uid}`).get();
  const role = profile.get('role');
  if (role !== 'staff' && role !== 'admin')
    throw new HttpsError('permission-denied', 'Only staff can do this.');
  return { uid: req.auth.uid, name: String(profile.get('name') ?? ''), role };
}

export function docId(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 200 || value.includes('/')) {
    throw new HttpsError('invalid-argument', 'Missing or invalid id.');
  }
  return value;
}

export function kindOf(value: unknown): Kind {
  if (value !== 'order' && value !== 'booking')
    throw new HttpsError('invalid-argument', 'Unknown payment.');
  return value;
}

export function collectionOf(kind: Kind): string {
  return kind === 'order' ? 'orders' : 'bookings';
}

// ── Booking chat ─────────────────────────────────────────────────────────────

export const SYSTEM_SENDER = { id: 'system', name: 'IOTEL', role: 'staff' };

/**
 * Adds an `event` line to a booking's chat inside `tx`, the way the app's MessageService does. It is unread for the
 * other side: a customer's line for staff, a staff line for the customer, a system line for both.
 */
export function stageEvent(
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
  const system = sender.id === SYSTEM_SENDER.id;
  tx.update(conversation, {
    lastMessage: content,
    lastMessageAt: FieldValue.serverTimestamp(),
    ...(system || sender.role !== 'customer' ? { customerUnread: FieldValue.increment(1) } : {}),
    ...(system || sender.role === 'customer' ? { staffUnread: FieldValue.increment(1) } : {}),
  });
}

// ── Labels ───────────────────────────────────────────────────────────────────

const METHOD_LABELS: Record<string, string> = {
  card: 'card',
  gcash: 'GCash',
  paymaya: 'Maya',
  grab_pay: 'GrabPay',
  qrph: 'QR Ph',
  dob: 'online banking',
  dob_ubp: 'online banking',
  billease: 'BillEase',
  cash: 'cash',
  bank: 'bank transfer',
};

/**
 * "GCash" for `gcash`, "BPI transfer" for `bank:BPI`, etc.; empty when unknown. Mirrors `paymentMethodLabel` in
 * src/app/core/payments/payment-methods.ts.
 */
export function methodLabel(method: unknown): string {
  if (typeof method !== 'string' || !method) return '';
  if (method.startsWith('bank:')) return `${method.slice(5)} transfer`;
  return METHOD_LABELS[method] ?? method;
}

export function peso(value: number): string {
  return `₱${value.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
}

// ── Stock ────────────────────────────────────────────────────────────────────

/** Current stock of each product in the order, once per product (as `readStock` in the app's OrderService). */
export async function readStock(
  tx: Transaction,
  items: readonly { productId: string; qty: number }[],
) {
  const wanted = new Map<string, number>();
  for (const item of items)
    wanted.set(item.productId, (wanted.get(item.productId) ?? 0) + item.qty);
  if (!wanted.size) return [];
  const snaps = await tx.getAll(...[...wanted.keys()].map((id) => db.doc(`products/${id}`)));
  return snaps.map((snap) => ({
    ref: snap.ref,
    exists: snap.exists,
    qty: wanted.get(snap.id)!,
    stock: Math.max(0, Math.floor(Number(snap.get('stock')) || 0)),
  }));
}

// ── Manual refunds and screenshots ───────────────────────────────────────────

/** Mirrors MAX_PROOF_BYTES in src/app/core/payments/manual-payments.ts and storage.rules. */
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

/** True when the screenshot at `path` exists in Storage and is a JPG, PNG or WebP of at most 5 MB. */
export async function proofImageOk(path: string): Promise<boolean> {
  const [meta] = await getStorage()
    .bucket()
    .file(path)
    .getMetadata()
    .catch(() => [null]);
  return (
    !!meta &&
    /^image\/(jpeg|png|webp)$/.test(String(meta.contentType)) &&
    Number(meta.size) <= MAX_PROOF_BYTES
  );
}

/**
 * Payments staff refund by sending the money back themselves (with a reference number) instead of through PayMongo:
 * transfers, on-site payments, and PayMongo QR Ph, which PayMongo refuses to refund on this account ("Refunds are not
 * allowed for payments with source type qrph"). Mirrors `refundsManually` in src/app/core/payments/payment-methods.ts.
 */
export function refundsManually(payment: Record<string, unknown> | undefined): boolean {
  return (payment?.['provider'] ?? 'paymongo') !== 'paymongo' || payment?.['method'] === 'qrph';
}

/** Where the customer wants a manual refund sent. Mirrors `RefundAccount` in the app's payment.model.ts. */
export interface RefundAccount {
  type: 'gcash' | 'bank';
  /** Bank accounts only. */
  bank?: string;
  accountName: string;
  /** `09XXXXXXXXX` for GCash; digits only for a bank account. */
  accountNumber: string;
}

const ACCOUNT_NAME = /^[\p{L}][\p{L} .,'-]{1,59}$/u;
const BANK_NAME = /^[\p{L}\d][\p{L}\d &.,'()-]{1,59}$/u;

/** Checks the refund account a customer typed; throws a message they can act on. */
export function refundAccountOf(value: unknown): RefundAccount {
  const input = (value ?? {}) as Record<string, unknown>;
  const str = (key: string) =>
    typeof input[key] === 'string' ? (input[key] as string).trim() : '';
  const type = input['type'];
  if (type !== 'gcash' && type !== 'bank') {
    throw new HttpsError('invalid-argument', 'Choose where we should send your refund.');
  }
  const accountName = str('accountName').replace(/\s+/g, ' ');
  if (!ACCOUNT_NAME.test(accountName)) {
    throw new HttpsError('invalid-argument', 'Enter the account name exactly as registered.');
  }
  if (type === 'gcash') {
    // `+63 917-123-4567` → `09171234567`, as `normalizeMobile` in the app.
    const number = str('accountNumber')
      .replace(/[^\d+]/g, '')
      .replace(/^\+?63(?=9)/, '0')
      .replace(/\D/g, '');
    if (!/^09\d{9}$/.test(number)) {
      throw new HttpsError('invalid-argument', 'Enter your GCash number as 09XXXXXXXXX.');
    }
    return { type, accountName, accountNumber: number };
  }
  const bank = str('bank').replace(/\s+/g, ' ');
  if (!BANK_NAME.test(bank))
    throw new HttpsError('invalid-argument', 'Enter the name of your bank.');
  const number = str('accountNumber').replace(/[\s-]/g, '');
  if (!/^\d{6,20}$/.test(number)) {
    throw new HttpsError('invalid-argument', 'Enter your bank account number (6 to 20 digits).');
  }
  return { type, bank, accountName, accountNumber: number };
}

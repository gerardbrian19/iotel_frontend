/**
 * Cancellation requests for paid orders. A customer can't cancel a paid order by themselves (the money has to go
 * back), so they ask: `requestOrderCancellation` stores `cancelRequest` on the order (reason + explanation), and staff
 * or an admin either approve it by refunding the order (`refundPayment`, which marks the request approved) or reject it
 * with `rejectOrderCancellation`. Clients never write `cancelRequest` (firestore.rules).
 */
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { db } from './app.js';
import { logActivity, orderCode } from './activity.js';
import { docId, requireCustomer, requireStaff } from './payment-common.js';

/** Mirrors CANCEL_REQUEST_REASONS in src/app/core/models/order.model.ts. */
export const CANCEL_REQUEST_REASONS: Record<string, string> = {
  'changed-mind': 'Changed my mind',
  'wrong-item': 'Ordered the wrong item or quantity',
  'better-price': 'Found a better price elsewhere',
  'too-long': 'It is taking too long',
  'wrong-address': 'Wrong shipping address',
  other: 'Other',
};

const MIN_DETAILS = 10;
const MAX_DETAILS = 500;
/** Statuses a paid order can still be cancelled (refunded) in; mirrors `canRefund` in refundPayment. */
const CANCELLABLE = ['Pending', 'Processing'];

/** Customer: asks for their paid order to be cancelled and refunded. */
export const requestOrderCancellation = onCall(async (req) => {
  const customer = await requireCustomer(req);
  const id = docId(req.data?.orderId);
  const reason = typeof req.data?.reason === 'string' ? req.data.reason : '';
  if (!(reason in CANCEL_REQUEST_REASONS)) {
    throw new HttpsError('invalid-argument', 'Choose why you want to cancel.');
  }
  const details = typeof req.data?.details === 'string' ? req.data.details.trim() : '';
  if (details.length < MIN_DETAILS || details.length > MAX_DETAILS) {
    throw new HttpsError(
      'invalid-argument',
      `Please explain in ${MIN_DETAILS} to ${MAX_DETAILS} characters.`,
    );
  }

  const ref = db.doc(`orders/${id}`);
  const code = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('customerId') !== customer.uid) {
      throw new HttpsError('not-found', 'This order could not be found.');
    }
    if (snap.get('payment.status') !== 'Paid') {
      throw new HttpsError(
        'failed-precondition',
        'Only a paid order needs a cancellation request.',
      );
    }
    const status = String(snap.get('status'));
    if (!CANCELLABLE.includes(status)) {
      throw new HttpsError(
        'failed-precondition',
        `This order is already ${status.toLowerCase()}, so it can no longer be cancelled.`,
      );
    }
    if (snap.get('cancelRequest.status') === 'pending') {
      throw new HttpsError('already-exists', 'You already asked to cancel this order.');
    }
    tx.update(ref, {
      cancelRequest: {
        status: 'pending',
        reason,
        details,
        requestedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return orderCode(snap.get('number'));
  });

  logger.info('Cancellation requested', { orderId: id, by: customer.uid });
  await logActivity({
    category: 'order',
    action: 'order.cancelRequested',
    summary: `Asked to cancel ${code}: ${CANCEL_REQUEST_REASONS[reason]}`,
    actor: { id: customer.uid, name: customer.name, role: 'customer' },
    targetType: 'order',
    targetId: id,
    targetLabel: code,
  });
  return { ok: true };
});

/** Staff / admin: turns a cancellation request down; the order carries on and the customer sees why. */
export const rejectOrderCancellation = onCall(async (req) => {
  const staff = await requireStaff(req);
  const id = docId(req.data?.orderId);
  const note = typeof req.data?.note === 'string' ? req.data.note.trim() : '';
  if (!note || note.length > 300) {
    throw new HttpsError('invalid-argument', 'Tell the customer why (up to 300 characters).');
  }

  const ref = db.doc(`orders/${id}`);
  const code = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'This order could not be found.');
    if (snap.get('cancelRequest.status') !== 'pending') {
      throw new HttpsError('failed-precondition', 'There is no open cancellation request.');
    }
    tx.update(ref, {
      'cancelRequest.status': 'rejected',
      'cancelRequest.reviewNote': note,
      'cancelRequest.reviewedAt': FieldValue.serverTimestamp(),
      'cancelRequest.reviewedBy': staff.uid,
      'cancelRequest.reviewedByName': staff.name,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return orderCode(snap.get('number'));
  });

  await logActivity({
    category: 'order',
    action: 'order.cancelRejected',
    summary: `Rejected the cancellation request for ${code}: ${note}`,
    actor: { id: staff.uid, name: staff.name, role: staff.role },
    targetType: 'order',
    targetId: id,
    targetLabel: code,
  });
  return { ok: true };
});

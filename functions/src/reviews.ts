/**
 * Product reviews: 1–5 stars and an optional comment, from customers whose order with that product was delivered.
 * One review per customer and product, id `{productId}_{uid}`; sending again replaces it.
 *
 * - `productReviews/{id}`: the visible reviews, which every signed-in user reads. The product keeps `ratingSum` /
 *   `ratingCount` over these, changed in the same transaction.
 * - `hiddenReviews/{id}`: reviews an admin hid (`setReviewHidden`), with `hiddenAt` / `hiddenByName` / `hiddenReason`.
 *   Moved out of `productReviews` so customers' queries never touch them; they don't count in the average. Staff and
 *   admins read them, and the author reads their own.
 *
 * Clients only read (firestore.rules); these functions are the only writers.
 */
import { DocumentSnapshot, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './app.js';
import { logActivity } from './activity.js';
import { docId, requireCustomer, requireStaff } from './payment-common.js';

const MAX_COMMENT = 500;
const MAX_HIDE_REASON = 200;

/** "Juan Dela Cruz" → "Juan D.": enough to feel real, without showing the full name to every shopper. */
function publicName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Customer';
  const last = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : '';
  return `${parts[0]}${last}`;
}

const visibleRef = (id: string) => db.doc(`productReviews/${id}`);
const hiddenRef = (id: string) => db.doc(`hiddenReviews/${id}`);

/** The rating a visible review adds to the product's totals (a hidden or missing one adds nothing). */
function counted(snap: DocumentSnapshot): number {
  return snap.exists ? Number(snap.get('rating')) || 0 : 0;
}

export const submitProductReview = onCall(async (req) => {
  const customer = await requireCustomer(req);
  const orderId = docId(req.data?.orderId);
  const productId = docId(req.data?.productId);
  const rating = req.data?.rating;
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new HttpsError('invalid-argument', 'Choose from 1 to 5 stars.');
  }
  const comment = typeof req.data?.comment === 'string' ? req.data.comment.trim() : '';
  if (comment.length > MAX_COMMENT) {
    throw new HttpsError('invalid-argument', `Keep your comment under ${MAX_COMMENT} characters.`);
  }

  const id = `${productId}_${customer.uid}`;
  const orderRef = db.doc(`orders/${orderId}`);
  const productRef = db.doc(`products/${productId}`);

  const hidden = await db.runTransaction(async (tx) => {
    const [order, product, visible, hiddenSnap] = await Promise.all([
      tx.get(orderRef),
      tx.get(productRef),
      tx.get(visibleRef(id)),
      tx.get(hiddenRef(id)),
    ]);
    if (!order.exists || order.get('customerId') !== customer.uid) {
      throw new HttpsError('not-found', 'This order could not be found.');
    }
    if (order.get('status') !== 'Delivered') {
      throw new HttpsError(
        'failed-precondition',
        'You can rate products once your order is delivered.',
      );
    }
    const items = (order.get('items') as { productId?: string; name?: string }[] | undefined) ?? [];
    const item = items.find((line) => line.productId === productId);
    if (!item) throw new HttpsError('invalid-argument', 'This product is not in that order.');
    if (!product.exists) {
      throw new HttpsError('failed-precondition', 'This product is no longer in our catalog.');
    }

    const existing = visible.exists ? visible : hiddenSnap.exists ? hiddenSnap : null;
    const review = {
      productId,
      productName: String(item.name ?? product.get('name') ?? ''),
      orderId,
      customerId: customer.uid,
      customerName: publicName(customer.name),
      rating,
      comment,
      createdAt: existing ? existing.get('createdAt') : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    // A review an admin hid stays hidden when the customer edits it, and still doesn't count.
    if (hiddenSnap.exists) {
      tx.update(hiddenRef(id), review);
      return true;
    }
    tx.set(visibleRef(id), review);
    tx.update(productRef, {
      ratingSum: FieldValue.increment(rating - counted(visible)),
      ratingCount: FieldValue.increment(visible.exists ? 0 : 1),
    });
    return false;
  });
  return { ok: true, hidden };
});

/** Admin: hides a review from shoppers (and the product's average), or shows it again. */
export const setReviewHidden = onCall(async (req) => {
  const staff = await requireStaff(req);
  if (staff.role !== 'admin') throw new HttpsError('permission-denied', 'Only admins can do this.');
  const id = docId(req.data?.reviewId);
  const hide = req.data?.hidden === true;
  const reason = typeof req.data?.reason === 'string' ? req.data.reason.trim() : '';
  if (reason.length > MAX_HIDE_REASON) {
    throw new HttpsError(
      'invalid-argument',
      `Keep the reason under ${MAX_HIDE_REASON} characters.`,
    );
  }

  const { productName, customerName, rating } = await db.runTransaction(async (tx) => {
    const from = await tx.get(hide ? visibleRef(id) : hiddenRef(id));
    if (!from.exists) {
      throw new HttpsError(
        'failed-precondition',
        hide ? 'This review is already hidden.' : 'This review is already visible.',
      );
    }
    const data = from.data() ?? {};
    const productRef = db.doc(`products/${String(data['productId'])}`);
    const product = await tx.get(productRef);
    const stars = Number(data['rating']) || 0;

    if (hide) {
      tx.set(hiddenRef(id), {
        ...data,
        hiddenAt: FieldValue.serverTimestamp(),
        hiddenBy: staff.uid,
        hiddenByName: staff.name,
        ...(reason ? { hiddenReason: reason } : {}),
      });
      tx.delete(visibleRef(id));
    } else {
      const { hiddenAt: _a, hiddenBy: _b, hiddenByName: _c, hiddenReason: _d, ...visible } = data;
      tx.set(visibleRef(id), visible);
      tx.delete(hiddenRef(id));
    }
    if (product.exists) {
      tx.update(productRef, {
        ratingSum: FieldValue.increment(hide ? -stars : stars),
        ratingCount: FieldValue.increment(hide ? -1 : 1),
      });
    }
    return {
      productName: String(data['productName'] ?? ''),
      customerName: String(data['customerName'] ?? 'Customer'),
      rating: stars,
    };
  });

  await logActivity({
    category: 'product',
    action: hide ? 'review.hidden' : 'review.shown',
    summary: `${hide ? 'Hid' : 'Showed again'} ${customerName}'s ${rating}★ review of ${productName}${
      hide && reason ? `: ${reason}` : ''
    }`,
    actor: { id: staff.uid, name: staff.name, role: staff.role },
    targetType: 'product',
    targetId: id.slice(0, id.lastIndexOf('_')),
    targetLabel: productName,
  });
  return { ok: true };
});

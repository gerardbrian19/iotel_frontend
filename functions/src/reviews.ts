/**
 * Product reviews: 1–5 stars and an optional comment, from customers whose order with that product was delivered.
 * One review per customer and product (`productReviews/{productId}_{uid}`); sending again replaces it. The product
 * keeps `ratingSum` / `ratingCount` for the average, changed in the same transaction. Clients only read reviews
 * (firestore.rules); this function is the only writer.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './app.js';
import { docId, requireCustomer } from './payment-common.js';

const MAX_COMMENT = 500;

/** "Juan Dela Cruz" → "Juan D.": enough to feel real, without showing the full name to every shopper. */
function publicName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Customer';
  const last = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : '';
  return `${parts[0]}${last}`;
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

  const orderRef = db.doc(`orders/${orderId}`);
  const productRef = db.doc(`products/${productId}`);
  const reviewRef = db.doc(`productReviews/${productId}_${customer.uid}`);

  await db.runTransaction(async (tx) => {
    const [order, product, existing] = await Promise.all([
      tx.get(orderRef),
      tx.get(productRef),
      tx.get(reviewRef),
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

    const previous = existing.exists ? Number(existing.get('rating')) || 0 : 0;
    tx.set(reviewRef, {
      productId,
      productName: String(item.name ?? product.get('name') ?? ''),
      orderId,
      customerId: customer.uid,
      customerName: publicName(customer.name),
      rating,
      comment,
      createdAt: existing.exists ? existing.get('createdAt') : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(productRef, {
      ratingSum: FieldValue.increment(rating - previous),
      ratingCount: FieldValue.increment(existing.exists ? 0 : 1),
    });
  });
  return { ok: true };
});

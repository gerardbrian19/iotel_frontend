import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  DocumentData,
  Query,
  QueryDocumentSnapshot,
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Observable, combineLatest, defer, map } from 'rxjs';
import { FIRESTORE, FUNCTIONS } from '../firebase/firebase';
import { dataOf, isoOf } from '../firebase/timestamps';
import { ProductReview } from '../models';
import { AuthService } from './auth.service';

const REVIEWS = 'productReviews';
const HIDDEN_REVIEWS = 'hiddenReviews';

function toReview(snap: QueryDocumentSnapshot<DocumentData>, hidden: boolean): ProductReview {
  const data = dataOf(snap);
  return {
    id: snap.id,
    productId: String(data['productId'] ?? ''),
    productName: String(data['productName'] ?? ''),
    orderId: String(data['orderId'] ?? ''),
    customerId: String(data['customerId'] ?? ''),
    customerName: String(data['customerName'] ?? 'Customer'),
    rating: Math.min(5, Math.max(1, Math.round(Number(data['rating']) || 1))),
    comment: String(data['comment'] ?? ''),
    createdAt: isoOf(data['createdAt']),
    updatedAt: isoOf(data['updatedAt']),
    hidden,
    hiddenAt: hidden ? isoOf(data['hiddenAt']) || undefined : undefined,
    hiddenByName: hidden && data['hiddenByName'] ? String(data['hiddenByName']) : undefined,
    hiddenReason: hidden && data['hiddenReason'] ? String(data['hiddenReason']) : undefined,
  };
}

const newestFirst = (a: ProductReview, b: ProductReview) => b.updatedAt.localeCompare(a.updatedAt);

/** A query's documents as reviews, live. */
function watch(q: Query<DocumentData>, hidden: boolean): Observable<ProductReview[]> {
  return new Observable<ProductReview[]>((subscriber) =>
    onSnapshot(
      q,
      (snapshot) => subscriber.next(snapshot.docs.map((d) => toReview(d, hidden))),
      (err) => subscriber.error(err),
    ),
  );
}

/**
 * Product reviews: 1–5 stars and a comment, one per customer and product, sent from a delivered order.
 *
 * - `productReviews/{productId}_{uid}`: visible to every signed-in user, counted in the product's `ratingSum` /
 *   `ratingCount` (the average on `Product`).
 * - `hiddenReviews/{same id}`: hidden by an admin; only staff, admins and the author read them.
 *
 * The `submitProductReview` and `setReviewHidden` functions (functions/src/reviews.ts) do all the writing.
 */
@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly db = inject(FIRESTORE);
  private readonly functions = inject(FUNCTIONS);
  private readonly auth = inject(AuthService);

  private readonly _mine = signal<ProductReview[]>([]);
  /** The signed-in customer's own reviews (hidden ones too), by product id (to prefill the rating form). */
  readonly mineByProduct = computed(() => new Map(this._mine().map((r) => [r.productId, r])));

  private readonly customerId = computed(() => {
    const user = this.auth.currentUser();
    return user?.role === 'customer' ? user.id : null;
  });

  constructor() {
    effect((onCleanup) => {
      const uid = this.customerId();
      untracked(() => this._mine.set([]));
      if (!uid) return;
      const own = (name: string) =>
        query(collection(this.db, name), where('customerId', '==', uid));
      const subscription = combineLatest([
        watch(own(REVIEWS), false),
        watch(own(HIDDEN_REVIEWS), true),
      ]).subscribe({
        next: ([visible, hidden]) => this._mine.set([...visible, ...hidden]),
        error: (err) => console.error('Could not load your reviews', err),
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  /** A product's visible reviews, newest first, live. */
  forProduct(productId: string): Observable<ProductReview[]> {
    return watch(
      query(collection(this.db, REVIEWS), where('productId', '==', productId)),
      false,
    ).pipe(map((list) => list.sort(newestFirst)));
  }

  /** Staff / admins: every review, visible and hidden, newest first, live. */
  all(): Observable<ProductReview[]> {
    return combineLatest([
      watch(collection(this.db, REVIEWS), false),
      watch(collection(this.db, HIDDEN_REVIEWS), true),
    ]).pipe(map(([visible, hidden]) => [...visible, ...hidden].sort(newestFirst)));
  }

  /**
   * Customer: rates a product from one of their delivered orders; sending again replaces their review. Emits whether
   * the review is hidden (an admin hid an earlier version, so the update stays hidden).
   */
  submit(orderId: string, productId: string, rating: number, comment: string): Observable<boolean> {
    return defer(async () => {
      if (!this.customerId()) throw new Error('Sign in as a customer to rate products.');
      const res = await httpsCallable<
        { orderId: string; productId: string; rating: number; comment: string },
        { ok: boolean; hidden?: boolean }
      >(
        this.functions,
        'submitProductReview',
      )({ orderId, productId, rating, comment: comment.trim() });
      return res.data.hidden === true;
    });
  }

  /** Admin: hides a review from shoppers and the product's average, or shows it again. */
  setHidden(review: ProductReview, hidden: boolean, reason = ''): Observable<void> {
    return defer(async () => {
      if (this.auth.currentUser()?.role !== 'admin') throw new Error('Only admins can do this.');
      await httpsCallable<{ reviewId: string; hidden: boolean; reason: string }, { ok: boolean }>(
        this.functions,
        'setReviewHidden',
      )({ reviewId: review.id, hidden, reason: reason.trim() });
    });
  }
}

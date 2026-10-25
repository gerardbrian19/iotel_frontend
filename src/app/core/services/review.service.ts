import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  DocumentData,
  QueryDocumentSnapshot,
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Observable, defer } from 'rxjs';
import { FIRESTORE, FUNCTIONS } from '../firebase/firebase';
import { dataOf, isoOf } from '../firebase/timestamps';
import { ProductReview } from '../models';
import { AuthService } from './auth.service';

const REVIEWS = 'productReviews';

function toReview(snap: QueryDocumentSnapshot<DocumentData>): ProductReview {
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
  };
}

const newestFirst = (a: ProductReview, b: ProductReview) => b.updatedAt.localeCompare(a.updatedAt);

/**
 * Product reviews (`productReviews/{productId}_{uid}`): 1–5 stars and a comment, one per customer and product, sent
 * from a delivered order. The `submitProductReview` function checks the order and writes the review together with the
 * product's `ratingSum` / `ratingCount` (the average on `Product`).
 */
@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly db = inject(FIRESTORE);
  private readonly functions = inject(FUNCTIONS);
  private readonly auth = inject(AuthService);

  private readonly _mine = signal<ProductReview[]>([]);
  /** The signed-in customer's own reviews, by product id (to prefill the rating form). */
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
      const unsubscribe = onSnapshot(
        query(collection(this.db, REVIEWS), where('customerId', '==', uid)),
        (snapshot) => this._mine.set(snapshot.docs.map(toReview)),
        (err) => console.error('Could not load your reviews', err),
      );
      onCleanup(unsubscribe);
    });
  }

  /** A product's reviews, newest first, live. */
  forProduct(productId: string): Observable<ProductReview[]> {
    return new Observable<ProductReview[]>((subscriber) =>
      onSnapshot(
        query(collection(this.db, REVIEWS), where('productId', '==', productId)),
        (snapshot) => subscriber.next(snapshot.docs.map(toReview).sort(newestFirst)),
        (err) => subscriber.error(err),
      ),
    );
  }

  /** Customer: rates a product from one of their delivered orders; sending again replaces their review. */
  submit(orderId: string, productId: string, rating: number, comment: string): Observable<void> {
    return defer(async () => {
      if (!this.customerId()) throw new Error('Sign in as a customer to rate products.');
      await httpsCallable<
        { orderId: string; productId: string; rating: number; comment: string },
        { ok: boolean }
      >(
        this.functions,
        'submitProductReview',
      )({ orderId, productId, rating, comment: comment.trim() });
    });
  }
}

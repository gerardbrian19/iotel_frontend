import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzRateModule } from 'ng-zorro-antd/rate';
import { Order, OrderItem } from '../../../core/models';
import { StarRatingComponent } from '../star-rating/star-rating.component';
import { functionErrorMessage } from '../../../core/firebase/auth-errors';
import { ReviewService } from '../../../core/services/review.service';
import { PLACEHOLDER_IMAGE, onImageError } from '../../utils/product-image';

interface Draft {
  rating: number;
  comment: string;
}

const RATING_WORDS = ['Tap a star to rate', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/** One-tap phrases added to the comment. */
const QUICK_PHRASES = [
  'Great quality',
  'Works as described',
  'Good value for money',
  'Clear audio',
  'Well packed',
  'Fast delivery',
];
const MAX_COMMENT = 500;

/**
 * Customer, delivered order: "Rate products" opens a form with 1–5 stars and a comment for each product in it. Saving
 * one again replaces the customer's earlier review of that product (ReviewService).
 */
@Component({
  selector: 'app-order-reviews',
  standalone: true,
  imports: [
    FormsModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzModalModule,
    NzRateModule,
    StarRatingComponent,
  ],
  templateUrl: './order-reviews.component.html',
  styleUrl: './order-reviews.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderReviewsComponent {
  private readonly reviews = inject(ReviewService);
  private readonly msg = inject(NzMessageService);

  readonly order = input.required<Order>();

  readonly visible = signal(false);
  readonly saving = signal<string | null>(null);
  readonly drafts = signal<Record<string, Draft>>({});
  readonly words = RATING_WORDS;
  readonly phrases = QUICK_PHRASES;
  readonly maxComment = MAX_COMMENT;
  readonly placeholder = PLACEHOLDER_IMAGE;
  readonly onImageError = onImageError;

  /** One line per product, even if the order lists it twice. */
  readonly items = computed(() => {
    const seen = new Map<string, OrderItem>();
    for (const item of this.order().items)
      if (!seen.has(item.productId)) seen.set(item.productId, item);
    return [...seen.values()];
  });
  readonly allRated = computed(() =>
    this.items().every((item) => this.reviews.mineByProduct().has(item.productId)),
  );

  readonly ratedCount = computed(
    () => this.items().filter((item) => this.reviews.mineByProduct().has(item.productId)).length,
  );
  /** The customer's average stars over this order's products they rated, shown beside the button. */
  readonly myRating = computed(() => {
    const mine = this.items()
      .map((item) => this.reviews.mineByProduct().get(item.productId)?.rating)
      .filter((r): r is number => !!r);
    return mine.length ? mine.reduce((a, b) => a + b, 0) / mine.length : null;
  });

  /** 'low' (1–2), 'mid' (3) or 'high' (4–5), for the colour of the rating label. */
  tone(rating: number): string {
    return rating === 0 ? 'none' : rating <= 2 ? 'low' : rating === 3 ? 'mid' : 'high';
  }

  hasPhrase(productId: string, phrase: string): boolean {
    return this.drafts()[productId]?.comment.toLowerCase().includes(phrase.toLowerCase()) ?? false;
  }

  /** Adds a quick phrase to the comment (or takes it out again). */
  togglePhrase(productId: string, phrase: string): void {
    const comment = this.drafts()[productId]?.comment ?? '';
    if (this.hasPhrase(productId, phrase)) {
      const rest = comment
        .split(/\.\s*/)
        .filter((part) => part.trim() && part.trim().toLowerCase() !== phrase.toLowerCase());
      this.patch(productId, { comment: rest.length ? `${rest.join('. ')}.` : '' });
      return;
    }
    const trimmed = comment.trim();
    const next = trimmed ? `${trimmed.replace(/[.\s]*$/, '')}. ${phrase}.` : `${phrase}.`;
    if (next.length <= MAX_COMMENT) this.patch(productId, { comment: next });
  }

  /** An admin hid the customer's review of this product. */
  hiddenByTeam(productId: string): boolean {
    return this.reviews.mineByProduct().get(productId)?.hidden === true;
  }

  reviewed(productId: string): boolean {
    return this.reviews.mineByProduct().has(productId);
  }

  openForm(): void {
    const mine = this.reviews.mineByProduct();
    this.drafts.set(
      Object.fromEntries(
        this.items().map((item) => {
          const review = mine.get(item.productId);
          return [item.productId, { rating: review?.rating ?? 0, comment: review?.comment ?? '' }];
        }),
      ),
    );
    this.visible.set(true);
  }

  patch(productId: string, change: Partial<Draft>): void {
    this.drafts.update((all) => ({ ...all, [productId]: { ...all[productId], ...change } }));
  }

  save(item: OrderItem): void {
    const draft = this.drafts()[item.productId];
    if (!draft?.rating) return;
    const update = this.reviewed(item.productId);
    this.saving.set(item.productId);
    this.reviews
      .submit(this.order().id, item.productId, draft.rating, draft.comment)
      .pipe(finalize(() => this.saving.set(null)))
      .subscribe({
        next: (hidden) =>
          hidden
            ? this.msg.info(
                'Saved. Our team has hidden your review of this product from other shoppers.',
              )
            : this.msg.success(update ? 'Rating updated.' : 'Thanks for rating this product!'),
        error: (err) =>
          this.msg.error(
            functionErrorMessage(err) ?? 'Your rating could not be saved. Please try again.',
          ),
      });
  }
}

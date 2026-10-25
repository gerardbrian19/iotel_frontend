import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, finalize, map, of, startWith } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { ProductReview } from '../../../core/models';
import { functionErrorMessage } from '../../../core/firebase/auth-errors';
import { AuthService } from '../../../core/services/auth.service';
import { OrderService } from '../../../core/services/order.service';
import { ProductService } from '../../../core/services/product.service';
import { ReviewService } from '../../../core/services/review.service';
import { PLACEHOLDER_IMAGE, onImageError } from '../../utils/product-image';
import { StarRatingComponent } from '../star-rating/star-rating.component';

type StarFilter = 'all' | 'low' | '1' | '2' | '3' | '4' | '5';
type StatusFilter = 'all' | 'visible' | 'hidden';

const PAGE_SIZE = 20;

/**
 * Staff and admins: every product review, newest first, with filters (product, stars, visible / hidden, search) and
 * the reviewer's full name and order (from the orders staff can read; reviews themselves only keep "Juan D."). Admins
 * hide a review from shoppers and the average, or show it again (`setReviewHidden`). Lives at `/staff/reviews` and
 * `/admin/reviews`; `?product=<id>` opens it filtered to one product.
 */
@Component({
  selector: 'app-reviews-manager',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    NzButtonModule,
    NzEmptyModule,
    NzIconModule,
    NzInputModule,
    NzModalModule,
    NzSelectModule,
    NzTagModule,
    StarRatingComponent,
  ],
  templateUrl: './reviews-manager.component.html',
  styleUrl: './reviews-manager.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewsManagerComponent {
  private readonly reviewService = inject(ReviewService);
  private readonly orders = inject(OrderService);
  private readonly products = inject(ProductService);
  private readonly auth = inject(AuthService);
  private readonly msg = inject(NzMessageService);

  /** `?product=<id>` from the route. */
  readonly product = input<string>();

  private readonly state = toSignal(
    this.reviewService.all().pipe(
      map((reviews) => ({ reviews, loading: false, error: false })),
      startWith({ reviews: [] as ProductReview[], loading: true, error: false }),
      catchError(() => of({ reviews: [] as ProductReview[], loading: false, error: true })),
    ),
    { requireSync: true },
  );
  readonly reviews = computed(() => this.state().reviews);
  readonly loading = computed(() => this.state().loading);
  readonly error = computed(() => this.state().error);

  readonly isAdmin = computed(() => this.auth.currentUser()?.role === 'admin');

  readonly productFilter = signal<string | null>(null);
  readonly starFilter = signal<StarFilter>('all');
  readonly statusFilter = signal<StatusFilter>('all');
  readonly search = signal('');
  readonly limit = signal(PAGE_SIZE);

  readonly placeholder = PLACEHOLDER_IMAGE;
  readonly onImageError = onImageError;

  readonly hideTarget = signal<ProductReview | null>(null);
  readonly hideReason = signal('');
  readonly busy = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.product();
      untracked(() => this.productFilter.set(id || null));
    });
  }

  /** Products that have reviews, for the product filter, A–Z. */
  readonly productOptions = computed(() => {
    const names = new Map<string, string>();
    for (const r of this.reviews()) names.set(r.productId, r.productName || r.productId);
    return [...names]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly stats = computed(() => {
    const visible = this.reviews().filter((r) => !r.hidden);
    const sum = visible.reduce((total, r) => total + r.rating, 0);
    return {
      total: visible.length,
      average: visible.length ? sum / visible.length : 0,
      low: visible.filter((r) => r.rating <= 2).length,
      hidden: this.reviews().length - visible.length,
    };
  });

  readonly filtered = computed(() => {
    const product = this.productFilter();
    const stars = this.starFilter();
    const status = this.statusFilter();
    const q = this.search().trim().toLowerCase();
    return this.reviews().filter((r) => {
      if (product && r.productId !== product) return false;
      if (stars === 'low' ? r.rating > 2 : stars !== 'all' && r.rating !== Number(stars))
        return false;
      if (status !== 'all' && r.hidden !== (status === 'hidden')) return false;
      if (!q) return true;
      const order = this.orders.byId().get(r.orderId);
      return [r.productName, r.comment, r.customerName, order?.customerName, order?.code]
        .filter(Boolean)
        .some((text) => text!.toLowerCase().includes(q));
    });
  });
  readonly shown = computed(() => this.filtered().slice(0, this.limit()));

  productImage(productId: string): string {
    return this.products.byId().get(productId)?.imageUrl || this.placeholder;
  }

  /** Full name and order code, from the order the review was written for. */
  orderInfo(review: ProductReview): { name: string; code: string } | null {
    const order = this.orders.byId().get(review.orderId);
    return order ? { name: order.customerName, code: order.code } : null;
  }

  resetFilters(): void {
    this.productFilter.set(null);
    this.starFilter.set('all');
    this.statusFilter.set('all');
    this.search.set('');
    this.limit.set(PAGE_SIZE);
  }

  showMore(): void {
    this.limit.update((n) => n + PAGE_SIZE);
  }

  openHide(review: ProductReview): void {
    this.hideReason.set('');
    this.hideTarget.set(review);
  }

  closeHide(): void {
    this.hideTarget.set(null);
  }

  confirmHide(): void {
    const review = this.hideTarget();
    if (review) this.setHidden(review, true, this.hideReason(), () => this.closeHide());
  }

  showAgain(review: ProductReview): void {
    this.setHidden(review, false, '');
  }

  private setHidden(
    review: ProductReview,
    hidden: boolean,
    reason: string,
    done?: () => void,
  ): void {
    this.busy.set(review.id);
    this.reviewService
      .setHidden(review, hidden, reason)
      .pipe(finalize(() => this.busy.set(null)))
      .subscribe({
        next: () => {
          this.msg.success(
            hidden ? 'Review hidden from shoppers.' : 'Review is visible to shoppers again.',
          );
          done?.();
        },
        error: (err) =>
          this.msg.error(
            functionErrorMessage(err) ??
              (err instanceof Error ? err.message : 'Something went wrong. Please try again.'),
          ),
      });
  }
}

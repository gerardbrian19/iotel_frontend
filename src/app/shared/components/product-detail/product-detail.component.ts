import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { catchError, of, switchMap } from 'rxjs';
import { RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { Product } from '../../../core/models';
import { FavoritesService } from '../../../core/services/favorites.service';
import { ProductActions } from '../../../core/services/product-actions.service';
import { ReviewService } from '../../../core/services/review.service';
import { StarRatingComponent } from '../star-rating/star-rating.component';
import { PLACEHOLDER_IMAGE, onImageError } from '../../utils/product-image';

const REVIEWS_SHOWN = 5;

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    RouterLink,
    NzButtonModule,
    NzIconModule,
    NzTagModule,
    StarRatingComponent,
  ],
  templateUrl: './product-detail.component.html',
  styleUrl: './product-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
})
export class ProductDetailComponent {
  readonly product = input.required<Product>();
  readonly closed = output<void>();

  protected readonly actions = inject(ProductActions);
  private readonly favorites = inject(FavoritesService);
  private readonly reviewService = inject(ReviewService);

  protected readonly placeholder = PLACEHOLDER_IMAGE;
  protected readonly liked = computed(() => this.favorites.ids().has(this.product().id));
  protected readonly onImageError = onImageError;

  /** Live reviews of the product shown, newest first; empty if they can't be read. */
  protected readonly reviews = toSignal(
    toObservable(this.product).pipe(
      switchMap((p) => this.reviewService.forProduct(p.id).pipe(catchError(() => of([])))),
    ),
    { initialValue: [] },
  );
  protected readonly reviewLimit = signal(REVIEWS_SHOWN);
  protected readonly shownReviews = computed(() => this.reviews().slice(0, this.reviewLimit()));
  /** How many reviews gave each star count, 5 down to 1, with each one's share for the bars. */
  protected readonly breakdown = computed(() => {
    const all = this.reviews();
    return [5, 4, 3, 2, 1].map((stars) => {
      const count = all.filter((r) => r.rating === stars).length;
      return { stars, count, pct: all.length ? (count / all.length) * 100 : 0 };
    });
  });

  protected showMoreReviews(): void {
    this.reviewLimit.update((n) => n + REVIEWS_SHOWN);
  }
}

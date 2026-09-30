import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { ShowcaseService } from '../../../core/services/showcase.service';
import { PLACEHOLDER_IMAGE, onImageError } from '../../../shared/utils/product-image';

/**
 * Showcase only: the Best Sellers' public copy (`ShowcaseService`), viewable signed out. There is no add-to-cart here;
 * "View Product" opens the product in the catalog, which asks visitors to sign in first and then brings them back.
 */
@Component({
  selector: 'app-best-sellers',
  standalone: true,
  imports: [CurrencyPipe, RouterLink, NzIconModule],
  templateUrl: './best-sellers.component.html',
  styleUrl: './best-sellers.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BestSellersComponent {
  protected readonly showcase = inject(ShowcaseService);
  protected readonly placeholder = PLACEHOLDER_IMAGE;
  protected readonly onImageError = onImageError;
  /** Placeholder cards while loading. */
  protected readonly skeletons = [1, 2, 3, 4];
}

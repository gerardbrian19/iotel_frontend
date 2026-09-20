import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { Product } from '../../../core/models';
import { FavoritesService } from '../../../core/services/favorites.service';
import { ProductActions } from '../../../core/services/product-actions.service';
import { PLACEHOLDER_IMAGE, onImageError } from '../../utils/product-image';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CurrencyPipe, RouterLink, NzButtonModule, NzIconModule, NzTagModule],
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

  protected readonly placeholder = PLACEHOLDER_IMAGE;
  protected readonly liked = computed(() => this.favorites.ids().has(this.product().id));
  protected readonly onImageError = onImageError;
}

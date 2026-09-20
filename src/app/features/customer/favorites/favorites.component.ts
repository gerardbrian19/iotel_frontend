import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { Product } from '../../../core/models';
import { FavoritesService } from '../../../core/services/favorites.service';
import { ProductService } from '../../../core/services/product.service';
import { ProductCardComponent } from '../../../shared/components/product-card/product-card.component';
import { ProductDetailComponent } from '../../../shared/components/product-detail/product-detail.component';

@Component({
  selector: 'app-favorites',
  standalone: true,
  imports: [RouterLink, NzButtonModule, NzEmptyModule, NzSpinModule, ProductCardComponent, ProductDetailComponent],
  templateUrl: './favorites.component.html',
  styleUrl: './favorites.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FavoritesComponent {
  private readonly productService = inject(ProductService);
  private readonly favorites = inject(FavoritesService);

  readonly loading = this.productService.loading;
  private readonly selectedId = signal<string | null>(null);

  /** Liked products that still exist and are still on sale, A → Z. */
  readonly products = computed(() => {
    const byId = this.productService.byId();
    return [...this.favorites.ids()]
      .map(id => byId.get(id))
      .filter((p): p is Product => !!p && p.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly selectedProduct = computed(() => {
    const id = this.selectedId();
    return id ? (this.productService.byId().get(id) ?? null) : null;
  });

  openDetails(product: Product): void {
    this.selectedId.set(product.id);
  }

  closeDetails(): void {
    this.selectedId.set(null);
  }
}

import {
  ChangeDetectionStrategy, Component, computed, inject, signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ProductService } from '../../../core/services/product.service';
import { CartService } from '../../../core/services/cart.service';
import { Product, ProductCategory } from '../../../core/models';
import { CurrencyPipe } from '@angular/common';

type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'name-asc';

const CATEGORIES: (ProductCategory | 'All')[] = ['All', 'Handheld', 'Marine', 'Base Station', 'Accessories'];

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    CurrencyPipe,
    NzCardModule,
    NzButtonModule,
    NzTagModule,
    NzInputModule,
    NzSelectModule,
    NzIconModule,
    NzBadgeModule,
    NzEmptyModule,
  ],
  templateUrl: './catalog.component.html',
  styleUrl: './catalog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogComponent {
  private readonly productService = inject(ProductService);
  private readonly cart = inject(CartService);
  private readonly message = inject(NzMessageService);

  readonly categories = CATEGORIES;
  readonly selectedCategory = signal<ProductCategory | 'All'>('All');
  readonly searchQuery = signal('');
  readonly sortBy = signal<SortOption>('featured');

  readonly filteredProducts = computed(() => {
    let products = this.productService.products();
    const cat = this.selectedCategory();
    const query = this.searchQuery().toLowerCase();

    if (cat !== 'All') {
      products = products.filter(p => p.category === cat);
    }
    if (query) {
      products = products.filter(p => p.name.toLowerCase().includes(query));
    }
    return this.sort(products);
  });

  private sort(products: Product[]): Product[] {
    switch (this.sortBy()) {
      case 'price-asc': return [...products].sort((a, b) => a.price - b.price);
      case 'price-desc': return [...products].sort((a, b) => b.price - a.price);
      case 'name-asc': return [...products].sort((a, b) => a.name.localeCompare(b.name));
      default: return products;
    }
  }

  addToCart(product: Product): void {
    this.cart.addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
    });
    this.message.success(`${product.name} added to cart`);
  }

  onSearch(value: string): void {
    this.searchQuery.set(value);
  }
}

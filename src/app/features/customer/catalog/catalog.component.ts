import {
  ChangeDetectionStrategy, Component, computed, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
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

const CATEGORIES: (ProductCategory | 'All')[] = ['All', 'Handheld', 'Marine', 'Base Station', 'Accessories', 'Land Mobile', 'MOTOTRBO PORTABLE RADIOS', 'Aviation', 'Amateur', 'Receiver'];

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [
    CommonModule,
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
  readonly selectedProduct = signal<Product | null>(null);
  readonly selectedImageIndex = signal(0);
  readonly selectedVariation = signal<string | null>(null);
  readonly likedProducts = signal<Record<number, boolean>>({});
  readonly touchStartX = signal<number | null>(null);

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

  readonly displayedImage = computed(() => {
    const product = this.selectedProduct();
    if (!product) {
      return '';
    }

    const images = product.images ?? [];
    return images.length ? images[this.selectedImageIndex()] : product.imageUrl;
  });

  readonly isLiked = computed(() => {
    const product = this.selectedProduct();
    return product ? !!this.likedProducts()[product.id] : false;
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

  getPrimaryVariation(product: Product): string {
    return product.variations?.[0] ?? '';
  }

  hasMoreVariations(product: Product): boolean {
    return (product.variations?.length ?? 0) > 1;
  }

  getMoreVariationCount(product: Product): number {
    return Math.max((product.variations?.length ?? 1) - 1, 0);
  }

  openDetails(product: Product): void {
    this.selectedProduct.set(product);
    this.selectedImageIndex.set(0);
    this.selectedVariation.set(product.variations?.[0] ?? null);
  }

  closeDetails(): void {
    this.selectedProduct.set(null);
  }

  prevImage(): void {
    const product = this.selectedProduct();
    if (!product) {
      return;
    }

    const images = product.images ?? [];
    if (!images.length) {
      return;
    }

    this.selectedImageIndex.update(index => (index === 0 ? images.length - 1 : index - 1));
  }

  nextImage(): void {
    const product = this.selectedProduct();
    if (!product) {
      return;
    }

    const images = product.images ?? [];
    if (!images.length) {
      return;
    }

    this.selectedImageIndex.update(index => (index + 1) % images.length);
  }

  onTouchStart(event: TouchEvent): void {
    this.touchStartX.set(event.touches[0]?.clientX ?? null);
  }

  onTouchEnd(event: TouchEvent): void {
    const start = this.touchStartX();
    const end = event.changedTouches?.[0]?.clientX ?? null;
    if (start === null || end === null) {
      this.touchStartX.set(null);
      return;
    }

    const delta = end - start;
    if (Math.abs(delta) > 50) {
      if (delta < 0) {
        this.nextImage();
      } else {
        this.prevImage();
      }
    }
    this.touchStartX.set(null);
  }

  selectVariation(variation: string): void {
    this.selectedVariation.set(variation);
  }

  toggleLike(product: Product): void {
    this.likedProducts.update(state => ({
      ...state,
      [product.id]: !state[product.id],
    }));
    const liked = !this.likedProducts()[product.id];
    this.message.success(liked ? 'Added to favorites' : 'Removed from favorites');
  }

  shareProduct(product: Product): void {
    const shareText = `${product.name} — ₱${product.price.toLocaleString()}
Check it out in our catalog.`;

    if (navigator.share) {
      navigator.share({
        title: product.name,
        text: shareText,
        url: window.location.href,
      }).catch(() => {
        this.copyShareText(shareText);
      });
      return;
    }

    this.copyShareText(shareText);
  }

  private copyShareText(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.message.success('Product details copied to clipboard');
    }).catch(() => {
      this.message.error('Unable to share this product right now');
    });
  }

  onSearch(value: string): void {
    this.searchQuery.set(value);
  }
}

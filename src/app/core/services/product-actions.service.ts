import { Injectable, inject } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Product } from '../models';
import { CartService } from './cart.service';
import { FavoritesService } from './favorites.service';

/** Storefront actions shared by every place a product is shown (catalog, favorites, detail dialog). */
@Injectable({ providedIn: 'root' })
export class ProductActions {
  private readonly cart = inject(CartService);
  private readonly favorites = inject(FavoritesService);
  private readonly message = inject(NzMessageService);

  addToCart(product: Product): void {
    if (product.price === null || !product.inStock) return;
    const added = this.cart.addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
    });
    if (added) {
      this.message.success(`${product.name} added to cart`);
    } else {
      this.message.warning(`Only ${product.stock} of ${product.name} in stock, and they are all in your cart`);
    }
  }

  toggleFavorite(product: Product): void {
    this.favorites.toggle(product.id).subscribe({
      next: liked => this.message.success(liked ? 'Added to favorites' : 'Removed from favorites'),
      error: () => this.message.error('Could not update your favorites. Please try again.'),
    });
  }

  share(product: Product): void {
    const price = product.price === null ? 'Price on request' : `₱${product.price.toLocaleString()}`;
    const text = `${product.name} — ${price}\nCheck it out in our catalog.`;

    if (navigator.share) {
      navigator
        .share({ title: product.name, text, url: window.location.href })
        .catch(() => this.copy(text));
      return;
    }
    this.copy(text);
  }

  private copy(text: string): void {
    navigator.clipboard.writeText(text).then(
      () => this.message.success('Product details copied to clipboard'),
      () => this.message.error('Unable to share this product right now'),
    );
  }
}

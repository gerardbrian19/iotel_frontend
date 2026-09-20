import { Injectable, inject, signal } from '@angular/core';
import { CartItem } from '../models';
import { ProductService } from './product.service';

const SHIPPING_FEE = 250;

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly products = inject(ProductService);

  readonly items = signal<CartItem[]>([]);

  readonly itemCount = (() => {
    const items = this.items;
    return { value: () => items().reduce((sum, i) => sum + i.qty, 0) };
  })();

  get count(): number {
    return this.items().reduce((sum, i) => sum + i.qty, 0);
  }

  get subtotal(): number {
    return this.items().reduce((sum, i) => sum + i.price * i.qty, 0);
  }

  get shippingFee(): number {
    return this.items().length ? SHIPPING_FEE : 0;
  }

  get total(): number {
    return this.subtotal + this.shippingFee;
  }

  /** The most units of a product the cart can hold: its live stock. Products we can't look up aren't capped. */
  maxQty(productId: string): number {
    return this.products.byId().get(productId)?.stock ?? Infinity;
  }

  /** Adds one unit. Returns false, leaving the cart unchanged, when that would exceed the stock on hand. */
  addItem(item: Omit<CartItem, 'qty'>): boolean {
    const existing = this.items().find(i => i.productId === item.productId);
    const qty = (existing?.qty ?? 0) + 1;
    if (qty > this.maxQty(item.productId)) return false;
    if (existing) {
      this.updateQty(item.productId, qty);
    } else {
      this.items.update(list => [...list, { ...item, qty }]);
    }
    return true;
  }

  updateQty(productId: string, qty: number): void {
    if (qty <= 0) {
      this.removeItem(productId);
      return;
    }
    const capped = Math.min(qty, this.maxQty(productId));
    this.items.update(list =>
      list.map(i => (i.productId === productId ? { ...i, qty: capped } : i))
    );
  }

  removeItem(productId: string): void {
    this.items.update(list => list.filter(i => i.productId !== productId));
  }

  clear(): void {
    this.items.set([]);
  }
}

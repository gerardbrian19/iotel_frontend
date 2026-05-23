import { Injectable, signal } from '@angular/core';
import { CartItem } from '../models';

const FREE_SHIPPING_THRESHOLD = 5000;
const SHIPPING_FEE = 250;

@Injectable({ providedIn: 'root' })
export class CartService {
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
    return this.subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  }

  get total(): number {
    return this.subtotal + this.shippingFee;
  }

  get freeShippingThreshold(): number {
    return FREE_SHIPPING_THRESHOLD;
  }

  addItem(item: Omit<CartItem, 'qty'>): void {
    const existing = this.items().find(i => i.productId === item.productId);
    if (existing) {
      this.updateQty(item.productId, existing.qty + 1);
    } else {
      this.items.update(list => [...list, { ...item, qty: 1 }]);
    }
  }

  updateQty(productId: number, qty: number): void {
    if (qty <= 0) {
      this.removeItem(productId);
      return;
    }
    this.items.update(list =>
      list.map(i => (i.productId === productId ? { ...i, qty } : i))
    );
  }

  removeItem(productId: number): void {
    this.items.update(list => list.filter(i => i.productId !== productId));
  }

  clear(): void {
    this.items.set([]);
  }
}

import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { CartItem, Product } from '../models';
import { ProductService } from './product.service';

/** Flat shipping fee per order. Mirrored in `firestore.rules` (`validNewOrder`), so change both together. */
export const SHIPPING_FEE = 250;

/**
 * unavailable – inactive, deleted, without a price, or out of stock.
 * stock       – fewer units in stock than the cart holds.
 * price       – the catalog price differs from the cart line's.
 */
export interface CartProblem {
  productId: string;
  kind: 'unavailable' | 'stock' | 'price';
  message: string;
}

const peso = (amount: number) => `₱${amount.toLocaleString('en-PH')}`;

/** What is wrong with the cart lines when compared with the live catalog; empty when they can all be bought as they are. */
export function cartProblems(items: readonly CartItem[], catalog: ReadonlyMap<string, Product>): CartProblem[] {
  const problems: CartProblem[] = [];
  for (const item of items) {
    const product = catalog.get(item.productId);
    if (!product || !product.isActive || product.price === null) {
      problems.push({ productId: item.productId, kind: 'unavailable', message: `${item.name} is no longer available.` });
    } else if (product.stock <= 0) {
      problems.push({ productId: item.productId, kind: 'unavailable', message: `${item.name} is out of stock.` });
    } else if (item.qty > product.stock) {
      problems.push({
        productId: item.productId,
        kind: 'stock',
        message: `Only ${product.stock} of ${item.name} left in stock (you have ${item.qty} in your cart).`,
      });
    } else if (item.price !== product.price) {
      problems.push({
        productId: item.productId,
        kind: 'price',
        message: `The price of ${item.name} changed from ${peso(item.price)} to ${peso(product.price)}.`,
      });
    }
  }
  return problems;
}

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly products = inject(ProductService);

  readonly items = signal<CartItem[]>([]);

  /** Lines that can't be bought as they are right now. Empty until the catalog has loaded. */
  readonly problems = computed(() =>
    this.products.loading() ? [] : cartProblems(this.items(), this.products.byId()),
  );

  constructor() {
    // Keep the lines in step with the live catalog, so the customer always sees (and pays) the current price.
    effect(() => {
      const catalog = this.products.byId();
      if (this.products.loading()) return;
      untracked(() =>
        this.items.update(list => {
          let changed = false;
          const next = list.map(item => {
            const live = catalog.get(item.productId);
            if (!live || live.price === null) return item;
            if (live.price === item.price && live.name === item.name && live.imageUrl === item.imageUrl) return item;
            changed = true;
            return { ...item, price: live.price, name: live.name, imageUrl: live.imageUrl };
          });
          return changed ? next : list;
        }),
      );
    });
  }

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

  /** Drops lines that can't be bought any more and lowers quantities to what is in stock. */
  fitToStock(): void {
    const catalog = this.products.byId();
    this.items.update(list =>
      list.flatMap(item => {
        const live = catalog.get(item.productId);
        if (!live || !live.inStock || live.price === null) return [];
        return [{ ...item, qty: Math.min(item.qty, live.stock) }];
      }),
    );
  }

  clear(): void {
    this.items.set([]);
  }
}

import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { DocumentData, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase';
import { Product, ShowcaseProduct } from '../models';
import { AuthService } from './auth.service';
import { ProductService } from './product.service';

/**
 * `showcase/bestSellers` = { productIds, products, updatedAt }. `productIds` (which products, in order) is chosen by
 * `npm run sync:showcase` (top sellers by quantity ordered, or `--ids`); `products` holds their public fields.
 */
const SHOWCASE_PATH = ['showcase', 'bestSellers'] as const;

/** What is stored per product. Keep in step with `scripts/sync-showcase.mjs` and `validShowcaseItem` in firestore.rules. */
type StoredShowcaseProduct = Omit<ShowcaseProduct, 'inStock'>;

function storedCopy(p: StoredShowcaseProduct): StoredShowcaseProduct {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    description: p.description,
    imageUrl: p.imageUrl,
    price: p.price,
    stock: p.stock,
    isActive: p.isActive,
  };
}

function fromStored(data: DocumentData): StoredShowcaseProduct | null {
  if (typeof data?.['id'] !== 'string' || !data['id']) return null;
  const price = data['price'];
  return storedCopy({
    id: data['id'],
    name: String(data['name'] ?? data['id']),
    brand: String(data['brand'] ?? ''),
    category: data['category'] ?? 'Radio Accessories',
    description: String(data['description'] ?? ''),
    imageUrl: String(data['imageUrl'] ?? ''),
    price: typeof price === 'number' && Number.isFinite(price) && price >= 0 ? price : null,
    stock: Math.max(0, Math.floor(Number(data['stock']) || 0)),
    isActive: data['isActive'] !== false,
  });
}

/**
 * The landing page's Best Sellers: a public copy of a few products, readable without signing in (the `products`
 * collection itself needs a session and includes `dealerPrice`). While staff or an admin is signed in, the copy is
 * kept in step with the live catalog, so price and stock changes (orders being processed, admin edits) show up.
 */
@Injectable({ providedIn: 'root' })
export class ShowcaseService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly products = inject(ProductService);

  private readonly productIds = signal<string[]>([]);
  private readonly stored = signal<StoredShowcaseProduct[]>([]);
  private readonly _loading = signal(true);
  private readonly _error = signal<string | null>(null);

  readonly bestSellers = computed<ShowcaseProduct[]>(() =>
    this.stored().map((p) => ({ ...p, inStock: p.isActive && p.stock > 0 })),
  );
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  private readonly canSync = computed(() => {
    const role = this.auth.currentUser()?.role;
    return role === 'staff' || role === 'admin';
  });

  constructor() {
    onSnapshot(
      doc(this.db, ...SHOWCASE_PATH),
      (snap) => {
        const data = snap.data();
        this.productIds.set(
          Array.isArray(data?.['productIds']) ? data['productIds'].map(String) : [],
        );
        const list = Array.isArray(data?.['products']) ? data['products'] : [];
        this.stored.set(list.map(fromStored).filter((p): p is StoredShowcaseProduct => p !== null));
        this._error.set(null);
        this._loading.set(false);
      },
      (err) => {
        console.error('Could not load best sellers', err);
        this.stored.set([]);
        this._error.set('Best sellers are not available right now.');
        this._loading.set(false);
      },
    );

    effect(() => {
      if (!this.canSync() || this.products.loading() || this.products.error()) return;
      const ids = this.productIds();
      if (!ids.length) return;
      const byId = this.products.byId();
      const fresh = ids
        .map((id) => byId.get(id))
        .filter((p): p is Product => p !== undefined)
        .map(storedCopy);
      // An empty result means the catalog isn't loaded yet (e.g. right after sign-in), not that the products are gone.
      if (!fresh.length) return;
      if (JSON.stringify(fresh) === JSON.stringify(this.stored())) return;
      untracked(() => {
        updateDoc(doc(this.db, ...SHOWCASE_PATH), {
          products: fresh,
          updatedAt: serverTimestamp(),
        }).catch((err) => console.error('Could not refresh best sellers', err));
      });
    });
  }
}

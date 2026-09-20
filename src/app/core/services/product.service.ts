import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  DocumentData,
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import { Observable, from, map } from 'rxjs';
import { FIRESTORE } from '../firebase/firebase';
import { Product } from '../models';
import { AuthService } from './auth.service';

const COLLECTION = 'products';

/** Fields an admin can set. `inStock` is derived and `id` is the document id, so neither is stored. */
export type ProductInput = Omit<Product, 'id' | 'inStock'>;

function toNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Maps a `products/{id}` document to the shape the UI uses; tolerant of missing or malformed fields. */
export function toProduct(id: string, data: DocumentData): Product {
  const stock = Math.max(0, Math.floor(Number(data['stock']) || 0));
  const isActive = data['isActive'] !== false;
  return {
    id,
    name: String(data['name'] ?? id),
    brand: String(data['brand'] ?? ''),
    model: String(data['model'] ?? ''),
    category: data['category'] ?? 'Radio Accessories',
    subcategory: String(data['subcategory'] ?? ''),
    description: String(data['description'] ?? ''),
    imageUrl: String(data['imageUrl'] ?? ''),
    price: toNumberOrNull(data['srp']),
    oldPrice: toNumberOrNull(data['oldPrice']),
    stock,
    isActive,
    inStock: isActive && stock > 0,
    searchKeywords: Array.isArray(data['searchKeywords']) ? data['searchKeywords'].map(String) : [],
  };
}

/** Maps app fields back to document fields (`price` is stored as `srp`); only keys that are present are written. */
function toDocument(changes: Partial<ProductInput>): DocumentData {
  const { price, ...rest } = changes;
  const data: DocumentData = { ...rest };
  if ('price' in changes) data['srp'] = price;
  for (const key of Object.keys(data)) {
    if (data[key] === undefined) delete data[key];
  }
  return data;
}

function keywordsFor(product: Pick<ProductInput, 'name' | 'brand' | 'model' | 'category' | 'subcategory'>): string[] {
  const words = [product.name, product.brand, product.model, product.category, product.subcategory]
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return [...new Set(words)].sort();
}

/**
 * Products live in the Firestore `products` collection. The whole collection is streamed into a signal
 * while someone is signed in (the rules require it) and cleared on sign-out.
 */
@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);

  private readonly _products = signal<Product[]>([]);
  private readonly _loading = signal(true);
  private readonly _error = signal<string | null>(null);

  /** Every product, including inactive ones (for admin and staff screens). */
  readonly products = this._products.asReadonly();
  /** Products visible in the storefront. */
  readonly activeProducts = computed(() => this._products().filter(p => p.isActive));
  readonly byId = computed(() => new Map(this._products().map(p => [p.id, p])));
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  private readonly uid = computed(() => this.auth.currentUser()?.id ?? null);

  constructor() {
    effect(onCleanup => {
      const uid = this.uid();
      untracked(() => {
        this._error.set(null);
        if (!uid) {
          this._products.set([]);
          this._loading.set(false);
        } else {
          this._loading.set(true);
        }
      });
      if (!uid) return;

      const unsubscribe = onSnapshot(
        collection(this.db, COLLECTION),
        snapshot => {
          const list = snapshot.docs.map(d => toProduct(d.id, d.data()));
          list.sort((a, b) => a.name.localeCompare(b.name));
          this._products.set(list);
          this._loading.set(false);
        },
        err => {
          console.error('Could not load products', err);
          this._products.set([]);
          this._error.set(
            err.code === 'permission-denied'
              ? 'You do not have access to the product catalog. Ask an administrator to check the Firestore rules.'
              : 'We could not load the product catalog. Please try again.',
          );
          this._loading.set(false);
        },
      );
      onCleanup(unsubscribe);
    });
  }

  add(product: ProductInput): Observable<string> {
    const data = toDocument({
      ...product,
      searchKeywords: product.searchKeywords?.length ? product.searchKeywords : keywordsFor(product),
    });
    return from(addDoc(collection(this.db, COLLECTION), { ...data, currency: 'PHP' })).pipe(
      map(ref => ref.id),
    );
  }

  update(id: string, changes: Partial<ProductInput>): Observable<void> {
    return from(updateDoc(doc(this.db, COLLECTION, id), toDocument(changes)));
  }

  remove(id: string): Observable<void> {
    return from(deleteDoc(doc(this.db, COLLECTION, id)));
  }

  /** Shows or hides a product in the storefront. */
  setActive(id: string, isActive: boolean): Observable<void> {
    return this.update(id, { isActive });
  }

  adjustStock(id: string, qty: number): Observable<void> {
    return this.update(id, { stock: Math.max(0, Math.floor(qty)) });
  }
}

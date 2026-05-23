import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Product, ProductCategory } from '../models';
import { MOCK_PRODUCTS } from '../mocks/mock-data';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly _products = signal<Product[]>([...MOCK_PRODUCTS]);
  readonly products = this._products.asReadonly();

  getAll(): Observable<Product[]> {
    return of(this._products());
  }

  getById(id: number): Observable<Product | undefined> {
    return of(this._products().find(p => p.id === id));
  }

  add(product: Omit<Product, 'id'>): Observable<Product> {
    const newProduct: Product = { ...product, id: Date.now() };
    this._products.update(list => [...list, newProduct]);
    return of(newProduct);
  }

  update(id: number, changes: Partial<Product>): Observable<Product | undefined> {
    this._products.update(list =>
      list.map(p => (p.id === id ? { ...p, ...changes } : p))
    );
    return of(this._products().find(p => p.id === id));
  }

  remove(id: number): Observable<void> {
    this._products.update(list => list.filter(p => p.id !== id));
    return of(void 0);
  }

  toggleStock(id: number): Observable<void> {
    this._products.update(list =>
      list.map(p => (p.id === id ? { ...p, inStock: !p.inStock } : p))
    );
    return of(void 0);
  }

  adjustStock(id: number, qty: number): Observable<void> {
    this._products.update(list =>
      list.map(p => (p.id === id ? { ...p, stock: qty, inStock: qty > 0 } : p))
    );
    return of(void 0);
  }

  getByCategory(category: ProductCategory): Observable<Product[]> {
    return of(this._products().filter(p => p.category === category));
  }
}

import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Order, OrderStatus, ShippingAddress } from '../models';
import { CartItem } from '../models';
import { MOCK_ORDERS } from '../mocks/mock-data';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly _orders = signal<Order[]>([...MOCK_ORDERS]);
  readonly orders = this._orders.asReadonly();

  getAll(): Observable<Order[]> {
    return of(this._orders());
  }

  getById(id: string): Observable<Order | undefined> {
    return of(this._orders().find(o => o.id === id));
  }

  getByCustomer(customerId: string): Observable<Order[]> {
    return of(this._orders().filter(o => o.customerId === customerId));
  }

  createOrder(
    customerId: string,
    items: CartItem[],
    address: ShippingAddress,
    paymentMethod: Order['paymentMethod'],
    referenceNumber: string | undefined,
    subtotal: number,
    shippingFee: number
  ): Observable<Order> {
    const newOrder: Order = {
      id: `ORD-2026-${String(this._orders().length + 1).padStart(4, '0')}`,
      customerId,
      items: items.map(i => ({
        productId: i.productId,
        name: i.name,
        price: i.price,
        qty: i.qty,
        imageUrl: i.imageUrl,
      })),
      status: 'Pending',
      subtotal,
      shippingFee,
      total: subtotal + shippingFee,
      paymentMethod,
      referenceNumber,
      address,
      createdAt: new Date().toISOString(),
      estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    };
    this._orders.update(list => [newOrder, ...list]);
    return of(newOrder);
  }

  updateStatus(id: string, status: OrderStatus): Observable<void> {
    this._orders.update(list =>
      list.map(o => (o.id === id ? { ...o, status } : o))
    );
    return of(void 0);
  }
}

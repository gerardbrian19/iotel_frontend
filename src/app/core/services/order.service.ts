import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  DocumentData,
  DocumentReference,
  QueryDocumentSnapshot,
  Transaction,
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Observable, defer } from 'rxjs';
import { FIRESTORE, FUNCTIONS } from '../firebase/firebase';
import { functionErrorMessage } from '../firebase/auth-errors';
import { dataOf, isoOf } from '../firebase/timestamps';
import { customerCanCancel, isPaymentSettled } from '../orders/order-view';
import { toPayment } from '../payments/payment-methods';
import { CartItem, ORDER_STATUSES, Order, OrderItem, ShippingAddress } from '../models';
import { AuthService } from './auth.service';
import { cartProblems } from './cart.service';
import { ProductService } from './product.service';

const ORDERS = 'orders';
const PRODUCTS = 'products';

export function orderCode(number: number): string {
  return `ORD-${String(number).padStart(4, '0')}`;
}

/** What the customer chose at checkout. Prices, totals and the order itself are worked out by the backend. */
export interface PlaceOrder {
  items: readonly CartItem[];
  address: ShippingAddress;
}

/** The new order and the PayMongo checkout page to send the customer to. */
export interface OrderCheckout {
  orderId: string;
  checkoutUrl: string;
}

function optionalIso(value: unknown): string | undefined {
  return isoOf(value) || undefined;
}

function toOrder(snap: QueryDocumentSnapshot<DocumentData>): Order {
  const data = dataOf(snap);
  const address = data['address'] ?? {};
  const shipment = data['shipment'];
  const number = Number(data['number']) || 0;
  return {
    id: snap.id,
    number,
    code: orderCode(number),
    customerId: String(data['customerId'] ?? ''),
    customerName: String(data['customerName'] ?? ''),
    customerEmail: String(data['customerEmail'] ?? ''),
    items: (Array.isArray(data['items']) ? data['items'] : []).map(
      (item: DocumentData) =>
        ({
          productId: String(item['productId'] ?? ''),
          name: String(item['name'] ?? ''),
          price: Number(item['price']) || 0,
          qty: Number(item['qty']) || 0,
          imageUrl: String(item['imageUrl'] ?? ''),
        }) satisfies OrderItem,
    ),
    status: ORDER_STATUSES.includes(data['status']) ? data['status'] : 'Pending',
    subtotal: Number(data['subtotal']) || 0,
    shippingFee: Number(data['shippingFee']) || 0,
    total: Number(data['total']) || 0,
    payment: toPayment(data['payment']),
    address: {
      fullName: String(address['fullName'] ?? ''),
      addressLine: String(address['addressLine'] ?? ''),
      city: String(address['city'] ?? ''),
      province: String(address['province'] ?? ''),
      zip: String(address['zip'] ?? ''),
      mobile: String(address['mobile'] ?? ''),
    },
    shipment: shipment
      ? {
          courier: String(shipment['courier'] ?? ''),
          trackingNumber: String(shipment['trackingNumber'] ?? ''),
        }
      : undefined,
    estimatedDelivery: data['estimatedDelivery'] ? String(data['estimatedDelivery']) : undefined,
    cancelledBy: ['customer', 'staff', 'system'].includes(data['cancelledBy'])
      ? data['cancelledBy']
      : undefined,
    cancelReason: data['cancelReason'] ? String(data['cancelReason']) : undefined,
    createdAt: isoOf(data['createdAt']),
    updatedAt: isoOf(data['updatedAt']),
    processedAt: optionalIso(data['processedAt']),
    shippedAt: optionalIso(data['shippedAt']),
    deliveredAt: optionalIso(data['deliveredAt']),
    cancelledAt: optionalIso(data['cancelledAt']),
  };
}

/** A message for the user for whatever went wrong while placing or changing an order. */
export function orderErrorMessage(err: unknown): string {
  const fromFunction = functionErrorMessage(err);
  if (fromFunction) return fromFunction;
  const code = (err as { code?: string } | null)?.code;
  if (code === 'permission-denied') {
    return 'That change was not allowed. The order may have just changed, so please refresh and try again.';
  }
  if (code === 'unavailable')
    return 'You seem to be offline. Please check your connection and try again.';
  if (code === 'resource-exhausted') {
    return 'The server is over its usage limit right now. Please try again later.';
  }
  if (code === 'aborted' || code === 'failed-precondition') {
    return 'The order was being changed at the same time. Please try again.';
  }
  return err instanceof Error && !code ? err.message : 'Something went wrong. Please try again.';
}

/**
 * Orders, stored in Firestore.
 *
 * - `orders/{id}`: one per order. Customers see their own; staff and admins see all of them.
 * - `counters/orders`: `{ last }`, the last order number, kept by the backend.
 *
 * Flow: checkout calls the `createOrderCheckout` function, which prices the cart from the live catalog, writes the
 * order (Pending, payment Unpaid) and opens a PayMongo checkout → the customer pays there and PayMongo's webhook marks
 * the payment Paid (unpaid orders are cancelled after an hour) → staff start processing, which takes the items out
 * of stock in one transaction → staff mark it shipped with the courier → delivered.
 *
 * Stock is taken when staff start processing, not at checkout: an abandoned checkout never holds stock, and starting
 * to process fails if stock has run out since. A paid order is only ever cancelled through `refund` (the
 * `refundPayment` function), which also puts a processing order's items back in stock.
 */
@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly db = inject(FIRESTORE);
  private readonly functions = inject(FUNCTIONS);
  private readonly auth = inject(AuthService);
  private readonly products = inject(ProductService);

  private readonly _orders = signal<Order[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal(false);

  /** Newest first. Customers get their own orders, staff and admins all of them. */
  readonly orders = this._orders.asReadonly();
  readonly byId = computed(() => new Map(this._orders().map((o) => [o.id, o])));
  /** True until the first snapshot (or error) arrives. */
  readonly loading = this._loading.asReadonly();
  /** True when orders could not be loaded. */
  readonly error = this._error.asReadonly();

  private readonly viewer = computed(() => {
    const user = this.auth.currentUser();
    return user ? { id: user.id, role: user.role } : null;
  });

  constructor() {
    effect((onCleanup) => {
      const viewer = this.viewer();
      untracked(() => {
        this._orders.set([]);
        this._error.set(false);
        this._loading.set(viewer !== null);
      });
      if (!viewer) return;

      const unsubscribe = onSnapshot(
        viewer.role === 'customer'
          ? query(collection(this.db, ORDERS), where('customerId', '==', viewer.id))
          : collection(this.db, ORDERS),
        (snapshot) => {
          const list = snapshot.docs
            .map(toOrder)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.number - a.number);
          this._orders.set(list);
          this._error.set(false);
          this._loading.set(false);
        },
        (err) => {
          console.error('Could not load orders', err);
          this._error.set(true);
          this._loading.set(false);
        },
      );
      onCleanup(unsubscribe);
    });
  }

  /**
   * Customer: turns the cart into an order and a PayMongo checkout. Emits the order id and the checkout page to send
   * the customer to.
   */
  checkout(input: PlaceOrder): Observable<OrderCheckout> {
    return defer(async () => {
      this.requireUser();
      if (!input.items.length) throw new Error('Your cart is empty.');
      if (this.products.loading())
        throw new Error('The catalog is still loading. Please try again in a moment.');
      // The backend checks all of this again against the live documents; this just answers faster.
      const problem = cartProblems(input.items, this.products.byId())[0];
      if (problem) throw new Error(problem.message);
      const { fullName, addressLine, city, province, zip, mobile } = input.address;
      const res = await httpsCallable<unknown, OrderCheckout>(
        this.functions,
        'createOrderCheckout',
      )({
        items: input.items.map((item) => ({ productId: item.productId, qty: item.qty })),
        address: { fullName, addressLine, city, province, zip, mobile },
        origin: window.location.origin,
      });
      return res.data;
    });
  }

  /**
   * Cancels a pending order that hasn't been paid (customer, staff or admin); its PayMongo checkout is closed by the
   * backend. Paid orders are cancelled with `refund` instead.
   */
  cancel(order: Order, reason = ''): Observable<void> {
    return defer(async () => {
      const user = this.requireUser();
      const staff = user.role !== 'customer';
      const ref = doc(this.db, ORDERS, order.id);
      const why = reason.trim();
      await runTransaction(this.db, async (tx) => {
        const fresh = await this.freshOrder(tx, ref);
        if (!customerCanCancel(fresh)) {
          throw new Error(
            fresh.status === 'Pending' && fresh.payment.status === 'Paid'
              ? staff
                ? 'This order is paid. Use "Cancel & refund" instead.'
                : 'Your payment already went through, so this order can no longer be cancelled here. Please message us.'
              : `This order is already ${fresh.status.toLowerCase()}, so it can no longer be cancelled.`,
          );
        }
        tx.update(ref, {
          status: 'Cancelled',
          cancelledAt: serverTimestamp(),
          cancelledBy: staff ? 'staff' : 'customer',
          ...(why ? { cancelReason: why } : {}),
          updatedAt: serverTimestamp(),
        });
      });
    });
  }

  /**
   * Staff: refunds the order's PayMongo payment in full and cancels it if it isn't already (a processing order's
   * items go back in stock). Runs in the `refundPayment` function.
   */
  refund(order: Order, reason = ''): Observable<void> {
    return defer(async () => {
      this.requireStaff();
      await httpsCallable<{ kind: 'order'; id: string; reason: string }, { ok: boolean }>(
        this.functions,
        'refundPayment',
      )({ kind: 'order', id: order.id, reason: reason.trim() });
    });
  }

  /** Staff: accepts a paid pending order and takes its items out of stock. */
  startProcessing(order: Order): Observable<void> {
    return defer(async () => {
      this.requireStaff();
      const ref = doc(this.db, ORDERS, order.id);
      await runTransaction(this.db, async (tx) => {
        const fresh = await this.freshOrder(tx, ref);
        if (fresh.status !== 'Pending')
          throw new Error(`This order is already ${fresh.status.toLowerCase()}.`);
        if (!isPaymentSettled(fresh)) throw new Error('This order has not been paid yet.');

        const stock = await this.readStock(tx, fresh.items);
        const short = stock
          .filter((line) => line.stock < line.qty)
          .map((line) => `${line.name} (needs ${line.qty}, ${line.stock} in stock)`);
        if (short.length)
          throw new Error(
            `Not enough stock for ${short.join(', ')}. Adjust the inventory or cancel the order.`,
          );

        for (const line of stock) tx.update(line.snap.ref, { stock: line.stock - line.qty });
        tx.update(ref, {
          status: 'Processing',
          processedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
    });
  }

  /** Staff: the parcel was handed to the courier. */
  ship(order: Order, courier: string, trackingNumber: string): Observable<void> {
    return defer(async () => {
      this.requireStaff();
      if (this.current(order).status !== 'Processing')
        throw new Error('Only a processing order can be shipped.');
      const carrier = courier.trim();
      const tracking = trackingNumber.trim();
      if (!carrier) throw new Error('Enter the courier that will deliver the parcel.');
      if (carrier.length > 60 || tracking.length > 60)
        throw new Error('The courier and tracking number are too long.');
      await updateDoc(doc(this.db, ORDERS, order.id), {
        status: 'Shipped',
        shipment: { courier: carrier, trackingNumber: tracking },
        shippedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  }

  /** Staff: the customer received the parcel. */
  markDelivered(order: Order): Observable<void> {
    return defer(async () => {
      this.requireStaff();
      const current = this.current(order);
      if (current.status !== 'Shipped')
        throw new Error('Only a shipped order can be marked delivered.');
      await updateDoc(doc(this.db, ORDERS, order.id), {
        status: 'Delivered',
        deliveredAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  }

  /** The live copy of an order: the screens hold on to the one they rendered, which can be a moment behind. */
  private current(order: Order): Order {
    return this.byId().get(order.id) ?? order;
  }

  private async freshOrder(tx: Transaction, ref: DocumentReference): Promise<Order> {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('This order no longer exists.');
    return toOrder(snap);
  }

  /** Reads the stock of every product in the order, once per product. Products that no longer exist have stock 0. */
  private async readStock(tx: Transaction, items: readonly OrderItem[]) {
    const wanted = new Map<string, { name: string; qty: number }>();
    for (const item of items) {
      const line = wanted.get(item.productId);
      wanted.set(item.productId, { name: item.name, qty: (line?.qty ?? 0) + item.qty });
    }
    return Promise.all(
      [...wanted].map(async ([productId, { name, qty }]) => {
        const snap = await tx.get(doc(this.db, PRODUCTS, productId));
        const stock = snap.exists()
          ? Math.max(0, Math.floor(Number(snap.data()['stock']) || 0))
          : 0;
        return { snap, name, qty, stock };
      }),
    );
  }

  private requireUser() {
    const user = this.auth.currentUser();
    if (!user) throw new Error('Sign in to manage orders.');
    return user;
  }

  private requireStaff() {
    const user = this.requireUser();
    if (user.role === 'customer') throw new Error('Only staff can do that.');
    return user;
  }
}

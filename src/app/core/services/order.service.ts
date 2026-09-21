import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  DocumentData,
  DocumentReference,
  QueryDocumentSnapshot,
  Transaction,
  collection,
  deleteField,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Observable, defer } from 'rxjs';
import { toDateKey } from '../booking/schedule';
import { FIRESTORE } from '../firebase/firebase';
import { dataOf, isoOf } from '../firebase/timestamps';
import { customerCanCancel, isPaymentSettled } from '../orders/order-view';
import {
  PAYMENT_OPTIONS,
  PAYMENT_PROVIDER,
  needsReference,
  paymentOption,
  referenceError,
} from '../payments/payment-methods';
import {
  CartItem,
  ORDER_STATUSES,
  Order,
  OrderItem,
  OrderPayment,
  PaymentMethod,
  PaymentStatus,
  ShippingAddress,
} from '../models';
import { AuthService } from './auth.service';
import { SHIPPING_FEE, cartProblems } from './cart.service';
import { ProductService } from './product.service';

const ORDERS = 'orders';
const COUNTERS = 'counters';
const PRODUCTS = 'products';

/** Shown as the estimated delivery date; counted from the day the order is placed. */
export const ESTIMATED_DELIVERY_DAYS = 5;

const PAYMENT_STATUSES: readonly PaymentStatus[] = ['Unpaid', 'Submitted', 'Paid', 'Rejected'];
const PAYMENT_METHODS: readonly PaymentMethod[] = PAYMENT_OPTIONS.map((option) => option.method);

export function orderCode(number: number): string {
  return `ORD-${String(number).padStart(4, '0')}`;
}

/** What the customer chose at checkout. Prices, totals, ids and timestamps are worked out by `place`. */
export interface PlaceOrder {
  items: readonly CartItem[];
  address: ShippingAddress;
  method: PaymentMethod;
  /** Required for GCash and Bank Transfer. */
  referenceNumber?: string;
}

function optionalIso(value: unknown): string | undefined {
  return isoOf(value) || undefined;
}

function toOrder(snap: QueryDocumentSnapshot<DocumentData>): Order {
  const data = dataOf(snap);
  const payment = data['payment'] ?? {};
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
    payment: {
      provider: payment['provider'] === 'paymongo' ? 'paymongo' : 'manual',
      method: PAYMENT_METHODS.includes(payment['method']) ? payment['method'] : 'GCash',
      status: PAYMENT_STATUSES.includes(payment['status']) ? payment['status'] : 'Unpaid',
      amount: Number(payment['amount']) || 0,
      referenceNumber: payment['referenceNumber'] ? String(payment['referenceNumber']) : undefined,
      rejectionReason: payment['rejectionReason'] ? String(payment['rejectionReason']) : undefined,
      submittedAt: optionalIso(payment['submittedAt']),
      paidAt: optionalIso(payment['paidAt']),
    } satisfies OrderPayment,
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
    cancelledBy:
      data['cancelledBy'] === 'customer' || data['cancelledBy'] === 'staff'
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
 * - `counters/orders`: `{ last }`, the last order number. Placing an order bumps it in the same transaction, and the
 *   rules only accept `number == last`, so numbers are unique, sequential and can't be reused.
 *
 * Flow: the customer places the order (Pending; GCash / Bank Transfer come with their reference number, see
 * `payment-methods.ts`) → staff verify the payment (or accept Cash on Delivery) → staff start processing, which takes
 * the items out of stock in one transaction → staff mark it shipped with the courier → delivered (Cash on Delivery is
 * marked paid then). Cancelling a processing order puts its items back in stock.
 *
 * Stock is taken when staff start processing, not when the customer places the order: customers can't write to
 * `products` (only staff can adjust stock), and this way a reference number that turns out to be fake never holds
 * stock. The cart already caps quantities at the live stock, and starting to process fails if stock has run out since.
 *
 * `total` and the item prices are computed on the client from the live catalog, and the rules only check what they
 * can (shipping fee, `total == subtotal + shippingFee`, the payment shape). Staff verify every payment by hand today;
 * with PayMongo these amounts should be recomputed by the backend that creates the payment.
 */
@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly db = inject(FIRESTORE);
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

  /** Customer: places the order from the cart's lines. Emits the new order's id. */
  place(input: PlaceOrder): Observable<string> {
    return defer(() => this.placeOrder(input));
  }

  /**
   * Customer: cancels a pending order until staff have verified the payment. Staff and admins can cancel while it is
   * pending or processing; a processing order's items go back into stock.
   */
  cancel(order: Order, reason = ''): Observable<void> {
    return defer(async () => {
      const user = this.requireUser();
      const staff = user.role !== 'customer';
      const ref = doc(this.db, ORDERS, order.id);
      const why = reason.trim();
      await runTransaction(this.db, async (tx) => {
        const fresh = await this.freshOrder(tx, ref);
        if (
          staff
            ? fresh.status !== 'Pending' && fresh.status !== 'Processing'
            : !customerCanCancel(fresh)
        ) {
          throw new Error(
            fresh.status === 'Pending'
              ? 'Your payment was already verified, so this order can no longer be cancelled here. Please message us.'
              : `This order is already ${fresh.status.toLowerCase()}, so it can no longer be cancelled.`,
          );
        }
        // All reads come before any write.
        const stock = fresh.status === 'Processing' ? await this.readStock(tx, fresh.items) : [];
        for (const line of stock) {
          if (line.snap.exists()) tx.update(line.snap.ref, { stock: line.stock + line.qty });
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

  /** Customer: sends the reference number again after staff rejected the payment. */
  submitPayment(order: Order, referenceNumber: string): Observable<void> {
    return defer(async () => {
      const current = this.current(order);
      if (current.status !== 'Pending' || current.payment.status !== 'Rejected') {
        throw new Error('This order is not waiting for a new payment reference.');
      }
      const problem = referenceError(referenceNumber);
      if (problem) throw new Error(problem);
      await updateDoc(doc(this.db, ORDERS, order.id), {
        'payment.status': 'Submitted',
        'payment.referenceNumber': referenceNumber.trim(),
        'payment.submittedAt': serverTimestamp(),
        'payment.rejectionReason': deleteField(),
        updatedAt: serverTimestamp(),
      });
    });
  }

  /** Staff: accepts the reported payment. */
  verifyPayment(order: Order): Observable<void> {
    return defer(async () => {
      const current = this.current(order);
      if (current.status !== 'Pending' || current.payment.status !== 'Submitted') {
        throw new Error('There is no payment to verify on this order.');
      }
      await updateDoc(doc(this.db, ORDERS, order.id), {
        'payment.status': 'Paid',
        'payment.paidAt': serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  }

  /** Staff: rejects a reported payment (wrong reference, money not received) so the customer can submit it again. */
  rejectPayment(order: Order, reason: string): Observable<void> {
    return defer(async () => {
      const current = this.current(order);
      if (current.status !== 'Pending' || current.payment.status !== 'Submitted') {
        throw new Error('There is no payment to reject on this order.');
      }
      const why = reason.trim();
      await updateDoc(doc(this.db, ORDERS, order.id), {
        'payment.status': 'Rejected',
        ...(why ? { 'payment.rejectionReason': why } : {}),
        updatedAt: serverTimestamp(),
      });
    });
  }

  /** Staff: accepts a pending order (payment verified, or Cash on Delivery) and takes its items out of stock. */
  startProcessing(order: Order): Observable<void> {
    return defer(async () => {
      this.requireStaff();
      const ref = doc(this.db, ORDERS, order.id);
      await runTransaction(this.db, async (tx) => {
        const fresh = await this.freshOrder(tx, ref);
        if (fresh.status !== 'Pending')
          throw new Error(`This order is already ${fresh.status.toLowerCase()}.`);
        if (!isPaymentSettled(fresh))
          throw new Error("Verify the customer's payment before processing this order.");

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

  /** Staff: the customer received the parcel. Cash on Delivery orders count as paid from here. */
  markDelivered(order: Order): Observable<void> {
    return defer(async () => {
      this.requireStaff();
      const current = this.current(order);
      if (current.status !== 'Shipped')
        throw new Error('Only a shipped order can be marked delivered.');
      const collectCash =
        current.payment.method === 'Cash on Delivery' && current.payment.status !== 'Paid';
      await updateDoc(doc(this.db, ORDERS, order.id), {
        status: 'Delivered',
        deliveredAt: serverTimestamp(),
        ...(collectCash ? { 'payment.status': 'Paid', 'payment.paidAt': serverTimestamp() } : {}),
        updatedAt: serverTimestamp(),
      });
    });
  }

  private async placeOrder(input: PlaceOrder): Promise<string> {
    const user = this.requireUser();
    if (!input.items.length) throw new Error('Your cart is empty.');
    if (this.products.loading())
      throw new Error('The catalog is still loading. Please try again in a moment.');
    const catalog = this.products.byId();
    const problem = cartProblems(input.items, catalog)[0];
    if (problem) throw new Error(problem.message);

    const option = paymentOption(input.method);
    const reference = (input.referenceNumber ?? '').trim();
    if (needsReference(input.method)) {
      const invalid = referenceError(reference);
      if (invalid) throw new Error(invalid);
    }

    // Priced from the live catalog, which `cartProblems` just confirmed matches the cart.
    const items: OrderItem[] = input.items.map((item) => {
      const product = catalog.get(item.productId)!;
      return {
        productId: product.id,
        name: product.name,
        price: product.price!,
        qty: item.qty,
        imageUrl: product.imageUrl,
      };
    });
    const subtotal =
      Math.round(items.reduce((sum, item) => sum + item.price * item.qty, 0) * 100) / 100;
    const total = subtotal + SHIPPING_FEE;
    const { fullName, addressLine, city, province, zip, mobile } = input.address;

    const orderRef = doc(collection(this.db, ORDERS));
    const counterRef = doc(this.db, COUNTERS, 'orders');
    await runTransaction(this.db, async (tx) => {
      const counter = await tx.get(counterRef);
      const number = (counter.exists() ? Number(counter.data()['last']) || 0 : 0) + 1;
      tx.set(counterRef, { last: number });
      tx.set(orderRef, {
        number,
        customerId: user.id,
        customerName: user.name,
        customerEmail: user.email,
        items,
        subtotal,
        shippingFee: SHIPPING_FEE,
        total,
        address: { fullName, addressLine, city, province, zip, mobile },
        // The customer only ever creates an unverified payment; `Paid` is set by staff (later by PayMongo's webhook).
        payment: option.needsReference
          ? {
              provider: PAYMENT_PROVIDER,
              method: input.method,
              status: 'Submitted',
              amount: total,
              referenceNumber: reference,
              submittedAt: serverTimestamp(),
            }
          : { provider: PAYMENT_PROVIDER, method: input.method, status: 'Unpaid', amount: total },
        status: 'Pending',
        estimatedDelivery: toDateKey(
          new Date(Date.now() + ESTIMATED_DELIVERY_DAYS * 24 * 60 * 60 * 1000),
        ),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    return orderRef.id;
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

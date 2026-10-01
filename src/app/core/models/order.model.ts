import { OrderPayment } from './payment.model';

/**
 * Pending    – placed; waiting for the PayMongo payment, then for staff to start on it.
 * Processing – staff accepted it and took the items out of stock; being packed.
 * Shipped    – handed to the courier.
 * Delivered  – received by the customer.
 */
export type OrderStatus = 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'Pending',
  'Processing',
  'Shipped',
  'Delivered',
  'Cancelled',
];

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
  imageUrl: string;
}

export interface ShippingAddress {
  fullName: string;
  addressLine: string;
  city: string;
  province: string;
  zip: string;
  mobile: string;
}

export interface OrderShipment {
  courier: string;
  /** Empty when the courier gives none (e.g. our own delivery). */
  trackingNumber: string;
}

/** A document of the Firestore `orders` collection. */
export interface Order {
  /** `orders/{id}` document id. Use `code` wherever a person reads or says it. */
  id: string;
  /** Sequential number from the `counters/orders` document. */
  number: number;
  /** Human-readable order number, e.g. `ORD-0007`. */
  code: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  items: OrderItem[];
  status: OrderStatus;
  subtotal: number;
  shippingFee: number;
  total: number;
  payment: OrderPayment;
  address: ShippingAddress;
  shipment?: OrderShipment;
  /** Local calendar date, `YYYY-MM-DD`. */
  estimatedDelivery?: string;
  /** `system`: cancelled automatically because it wasn't paid in time. */
  cancelledBy?: 'customer' | 'staff' | 'system';
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
}

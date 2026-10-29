import { InvoiceInfo, OrderPayment, RefundAccount } from './payment.model';

/**
 * Pending    – placed; waiting for the PayMongo payment, then for staff to start on it.
 * Processing – staff accepted it and took the items out of stock; being packed.
 * Shipped    – handed to the courier.
 * Out for Delivery – on the way to the customer's address today.
 * Delivered  – received by the customer.
 */
export type OrderStatus =
  | 'Pending'
  | 'Processing'
  | 'Shipped'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Cancelled';

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'Pending',
  'Processing',
  'Shipped',
  'Out for Delivery',
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

/** Where an order is delivered, for its delivery estimate (`core/orders/delivery-estimate.ts`). */
export type DeliveryZone = 'metro-manila' | 'luzon' | 'visayas' | 'mindanao';

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

/** Why a customer wants a paid order cancelled. Mirrored in functions/src/cancellations.ts. */
export const CANCEL_REQUEST_REASONS = {
  'changed-mind': 'Changed my mind',
  'wrong-item': 'Ordered the wrong item or quantity',
  'better-price': 'Found a better price elsewhere',
  'too-long': 'It is taking too long',
  'wrong-address': 'Wrong shipping address',
  other: 'Other',
} as const;

export type CancelRequestReason = keyof typeof CANCEL_REQUEST_REASONS;

/**
 * pending  – the customer asked; staff / an admin still have to decide.
 * approved – the order was refunded and cancelled.
 * rejected – turned down (`reviewNote` says why); the order carries on.
 */
export type CancelRequestStatus = 'pending' | 'approved' | 'rejected';

/** A customer's request to cancel a paid order, written only by the Cloud Functions (cancellations.ts). */
export interface OrderCancelRequest {
  status: CancelRequestStatus;
  reason: CancelRequestReason;
  details: string;
  /** Where to send the money, when staff refund it themselves (QR Ph and transfer payments). */
  refundTo?: RefundAccount;
  requestedAt: string;
  reviewNote?: string;
  reviewedByName?: string;
  reviewedAt?: string;
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
  invoice?: InvoiceInfo;
  address: ShippingAddress;
  shipment?: OrderShipment;
  /** Latest expected delivery, Manila calendar date `YYYY-MM-DD`. */
  estimatedDelivery?: string;
  /** Earliest expected delivery (`YYYY-MM-DD`); missing on orders placed before delivery zones. */
  estimatedDeliveryFrom?: string;
  deliveryZone?: DeliveryZone;
  /** `system`: cancelled automatically because it wasn't paid in time. */
  cancelledBy?: 'customer' | 'staff' | 'system';
  cancelReason?: string;
  cancelRequest?: OrderCancelRequest;
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
  shippedAt?: string;
  outForDeliveryAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
}

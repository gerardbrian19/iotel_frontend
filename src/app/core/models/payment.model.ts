/** Every payment goes through PayMongo's hosted checkout; see `core/payments/payment-methods.ts`. */
export type PaymentProvider = 'paymongo';

/**
 * Unpaid   – the checkout was opened but PayMongo hasn't confirmed a payment yet.
 * Paid     – PayMongo confirmed it (set only by the backend webhook, never by the app).
 * Refunded – staff refunded it through PayMongo.
 */
export type PaymentStatus = 'Unpaid' | 'Paid' | 'Refunded';

/** What PayMongo reports the customer paid with, e.g. `gcash`, `paymaya`, `card`, `qrph`. */
export type PaymentMethod = string;

/** The payment of an order (`orders/{id}.payment`) or a service booking (`bookings/{id}.payment`). */
export interface Payment {
  provider: PaymentProvider;
  status: PaymentStatus;
  /** Amount due in PHP: the order total, or the booking's quote. */
  amount: number;
  /** Set once paid. */
  method?: PaymentMethod;
  checkoutSessionId?: string;
  /** PayMongo's hosted checkout page, while the payment is open. */
  checkoutUrl?: string;
  /** PayMongo payment id (`pay_…`), once paid. */
  paymentId?: string;
  paidAt?: string;
  refundId?: string;
  refundedAt?: string;
}

export type OrderPayment = Payment;

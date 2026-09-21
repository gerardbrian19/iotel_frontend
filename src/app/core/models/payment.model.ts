export type PaymentMethod = 'GCash' | 'Bank Transfer' | 'Cash on Delivery';

/**
 * Who confirms that the money arrived.
 * manual   – the customer reports a reference number and staff check it by hand (today).
 * paymongo – PayMongo confirms the payment and a backend webhook marks it paid (planned).
 */
export type PaymentProvider = 'manual' | 'paymongo';

/**
 * Unpaid    – nothing received yet (Cash on Delivery until it is delivered).
 * Submitted – the customer reported a payment; staff still have to verify it.
 * Paid      – confirmed. Set by staff today and by PayMongo's webhook later; never by the customer.
 * Rejected  – staff could not verify the reported payment; the customer can submit it again.
 */
export type PaymentStatus = 'Unpaid' | 'Submitted' | 'Paid' | 'Rejected';

/** The payment of one order. Stored as `orders/{id}.payment`. */
export interface OrderPayment {
  provider: PaymentProvider;
  method: PaymentMethod;
  status: PaymentStatus;
  /** Amount due in PHP; always the order total. */
  amount: number;
  /** What the customer entered from their GCash / bank receipt (manual provider). */
  referenceNumber?: string;
  rejectionReason?: string;
  submittedAt?: string;
  paidAt?: string;
}

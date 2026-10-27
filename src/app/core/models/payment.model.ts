/**
 * How a payment is made (see `core/payments/payment-methods.ts`):
 * paymongo – PayMongo's hosted checkout; its webhook confirms the payment.
 * manual   – a GCash / bank transfer to one of the `paymentReceivers`; the customer sends the reference number and a
 *            screenshot, and staff verify it.
 * onsite   – a service booking paid at the shop (cash, GCash, bank or card); staff record it.
 */
export type PaymentProvider = 'paymongo' | 'manual' | 'onsite';

/**
 * Unpaid   – not paid yet (or, for a transfer, not verified yet: see `ManualPayment.state`).
 * Paid     – confirmed by PayMongo, or by staff for a transfer or on-site payment (set only by the backend).
 * Refunded – staff refunded it: through PayMongo, or by sending the money back themselves.
 */
export type PaymentStatus = 'Unpaid' | 'Paid' | 'Refunded';

/**
 * How the customer paid, e.g. `gcash`, `paymaya`, `card`, `qrph` (from PayMongo), `bank:BPI` (a transfer to a bank
 * account) or `cash` (on site). Read it with `paymentMethodLabel`.
 */
export type PaymentMethod = string;

/**
 * awaiting  – the customer hasn't sent a proof yet.
 * submitted – a proof was sent and is waiting for staff.
 * rejected  – staff couldn't verify it (`rejectReason`); the customer can send it again.
 * approved  – staff verified it; the payment is Paid.
 */
export type ManualPaymentState = 'awaiting' | 'submitted' | 'rejected' | 'approved';

/**
 * Where a customer wants a refund sent when staff send it back themselves (`refundsManually`): given with their
 * cancellation request. Mirrors `RefundAccount` in functions/src/payment-common.ts.
 */
export interface RefundAccount {
  type: 'gcash' | 'bank';
  /** Bank accounts only. */
  bank?: string;
  accountName: string;
  /** `09XXXXXXXXX` for GCash; digits only for a bank account. */
  accountNumber: string;
}

/** The account the customer paid into, as it was when they paid. */
export interface ReceiverSnapshot {
  type: 'gcash' | 'bank';
  label: string;
  /** Empty for GCash. */
  bankName: string;
  accountName: string;
  accountNumber: string;
}

/** One proof the customer sent. */
export interface ManualPaymentAttempt {
  receiverId: string;
  receiver: ReceiverSnapshot;
  referenceNumber: string;
  /** What the customer says they sent, in PHP. */
  amountSent: number;
  /** When the customer says they sent it. */
  sentAt: string;
  /** The screenshot in Firebase Storage. */
  proofPath: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewedByName?: string;
  rejectReason?: string;
}

/** A GCash / bank transfer: the latest proof (when there is one) plus the rejected ones before it. */
export interface ManualPayment extends Partial<ManualPaymentAttempt> {
  state: ManualPaymentState;
  history: ManualPaymentAttempt[];
}

export type OnsiteMethod = 'cash' | 'gcash' | 'bank' | 'card';

/** Money staff received on site for a booking. */
export interface OnsitePayment {
  method: OnsiteMethod;
  receiptNumber: string;
  recordedByName: string;
  recordedAt?: string;
}

/** The payment of an order (`orders/{id}.payment`) or a service booking (`bookings/{id}.payment`). */
export interface Payment {
  provider: PaymentProvider;
  status: PaymentStatus;
  /** Amount due in PHP: the order total, or the booking's quote (for on-site payments, what was received). */
  amount: number;
  /** Set once paid. */
  method?: PaymentMethod;
  checkoutSessionId?: string;
  /** PayMongo's hosted checkout page, while the payment is open. */
  checkoutUrl?: string;
  /** PayMongo payment id (`pay_…`), the transfer's reference number, or the on-site receipt number, once paid. */
  paymentId?: string;
  paidAt?: string;
  refundId?: string;
  refundedAt?: string;
  /**
   * For refunds staff sent back themselves (transfers, on-site and PayMongo QR Ph payments, see `refundsManually`):
   * the reference of that transfer or receipt.
   */
  refundReference?: string;
  /** Screenshot of that refund in Firebase Storage (`refundProofs/…`), when staff attached one. */
  refundProofPath?: string;
  /** What staff wrote when refunding a manual refund, shown to the customer. */
  refundNote?: string;
  manual?: ManualPayment;
  onsite?: OnsitePayment;
}

export type OrderPayment = Payment;

/**
 * The invoice emailed to the customer for a paid order or booking (`invoice` on the document; only the backend writes
 * it, see functions/src/invoices.ts). PayMongo payments send it automatically; staff send it for transfers and on-site
 * payments, and can resend any.
 */
export interface InvoiceInfo {
  /** e.g. `INV-000123`, kept on resends. */
  number: string;
  /** Unset while the first send hasn't gone through. */
  sentAt?: string;
  sentTo?: string;
  sentByName?: string;
  sendCount: number;
}

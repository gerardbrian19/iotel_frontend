import { DocumentData } from 'firebase/firestore';
import { isoOf } from '../firebase/timestamps';
import { Payment, PaymentMethod, PaymentProvider, PaymentStatus } from '../models';

/**
 * How payments are collected: PayMongo's hosted checkout, for orders and service bookings alike.
 *
 * The backend (`functions/src/payments.ts`) creates the order or reads the booking's quote, opens a PayMongo checkout
 * for the amount and returns its URL; the app sends the customer there. PayMongo's webhook is the only thing that
 * marks a payment `Paid` (customers and staff can't, see `firestore.rules`), and staff refund through the backend.
 * Test and live mode differ only in the backend's secrets.
 */
export const PAYMENT_PROVIDER: PaymentProvider = 'paymongo';

/** Unpaid orders are cancelled after this long (`UNPAID_ORDER_TTL_MS` in functions/src/payments.ts). */
export const UNPAID_ORDER_MINUTES = 60;

/** What the PayMongo checkout offers (`PAYMENT_METHOD_TYPES` in functions/src/payments.ts), for the screens. */
export const ACCEPTED_PAYMENT_METHODS: readonly { label: string; icon: string }[] = [
  { label: 'GCash', icon: '📱' },
  { label: 'Maya', icon: '💳' },
  { label: 'Credit / Debit Card', icon: '💳' },
  { label: 'GrabPay', icon: '🚗' },
  { label: 'QR Ph', icon: '🔳' },
];

const METHOD_LABELS: Record<string, string> = {
  card: 'Card',
  gcash: 'GCash',
  paymaya: 'Maya',
  grab_pay: 'GrabPay',
  qrph: 'QR Ph',
  dob: 'Online banking',
  dob_ubp: 'Online banking',
  billease: 'BillEase',
};

/** "GCash" for `gcash`, etc. Empty until PayMongo reports how the customer paid. */
export function paymentMethodLabel(method: PaymentMethod | undefined): string {
  if (!method) return '';
  return METHOD_LABELS[method] ?? method;
}

const STATUSES: readonly PaymentStatus[] = ['Unpaid', 'Paid', 'Refunded'];

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/** Maps a stored `payment` map (order or booking) to the app's shape. */
export function toPayment(data: DocumentData | undefined): Payment {
  const payment = data ?? {};
  return {
    provider: PAYMENT_PROVIDER,
    status: STATUSES.includes(payment['status']) ? payment['status'] : 'Unpaid',
    amount: Number(payment['amount']) || 0,
    method: text(payment['method']),
    checkoutSessionId: text(payment['checkoutSessionId']),
    checkoutUrl: text(payment['checkoutUrl']),
    paymentId: text(payment['paymentId']),
    paidAt: isoOf(payment['paidAt']) || undefined,
    refundId: text(payment['refundId']),
    refundedAt: isoOf(payment['refundedAt']) || undefined,
  };
}

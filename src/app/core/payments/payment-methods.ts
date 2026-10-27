import { DocumentData } from 'firebase/firestore';
import { isoOf } from '../firebase/timestamps';
import {
  InvoiceInfo,
  ManualPayment,
  ManualPaymentAttempt,
  ManualPaymentState,
  OnsiteMethod,
  OnsitePayment,
  Payment,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  ReceiverSnapshot,
  RefundAccount,
} from '../models';

/**
 * How payments are collected, for orders and service bookings alike:
 *
 * - `paymongo`: PayMongo's hosted checkout. The backend (`functions/src/payments.ts`) creates the order or reads the
 *   booking's quote, opens a checkout for the amount and returns its URL; the app sends the customer there, and
 *   PayMongo's webhook marks the payment `Paid`. Test and live mode differ only in the backend's secrets.
 * - `manual`: a GCash / bank transfer to one of the `paymentReceivers`. The customer uploads a screenshot and gives
 *   the reference number (`submitManualPayment`), and staff approve or reject it (`reviewManualPayment`); see
 *   `manual-payments.ts` here and in functions/src.
 * - `onsite`: bookings only, when the quote allows it. Staff record the payment at the shop (`recordOnsitePayment`).
 *
 * Customers and staff never write `payment` themselves (`firestore.rules`); the Cloud Functions do.
 */
export const DEFAULT_PAYMENT_PROVIDER: PaymentProvider = 'paymongo';

/** Unpaid orders are cancelled after this long (`UNPAID_ORDER_TTL_MS` in functions/src/payments.ts). */
export const UNPAID_ORDER_MINUTES = 60;

/** PayMongo's smallest checkout amount, in pesos. Mirrored as MIN_CHECKOUT_AMOUNT in functions/src/payments.ts. */
export const MIN_CHECKOUT_AMOUNT = 20;

/** What the PayMongo checkout offers (`PAYMENT_METHOD_TYPES` in functions/src/payments.ts), for the screens. */
export const ACCEPTED_PAYMENT_METHODS: readonly { label: string; icon: string }[] = [
  // Only QR Ph until the live PayMongo account is verified; GCash, Maya, cards and GrabPay come back then.
  { label: 'QR Ph', icon: '🔳' },
];

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  bank: 'Bank transfer',
  card: 'Card',
  gcash: 'GCash',
  paymaya: 'Maya',
  grab_pay: 'GrabPay',
  qrph: 'QR Ph',
  dob: 'Online banking',
  dob_ubp: 'Online banking',
  billease: 'BillEase',
};

/**
 * "GCash" for `gcash`, "BPI transfer" for `bank:BPI`, etc. Empty until it is known how the customer paid. Mirrors
 * `methodLabel` in functions/src/payment-common.ts.
 */
export function paymentMethodLabel(method: PaymentMethod | undefined): string {
  if (!method) return '';
  if (method.startsWith('bank:')) return `${method.slice(5)} transfer`;
  return METHOD_LABELS[method] ?? method;
}

/**
 * Staff refund this payment by sending the money back themselves (with a reference number), not through PayMongo:
 * transfers, on-site payments, and PayMongo QR Ph, which PayMongo refuses to refund on this account. Mirrors
 * `refundsManually` in functions/src/payment-common.ts.
 */
export function refundsManually(payment: Payment): boolean {
  return payment.provider !== 'paymongo' || payment.method === 'qrph';
}

/** "GCash 0917 123 4567 · Juan Dela Cruz" or "BPI 1234567890 · Juan Dela Cruz". */
export function refundAccountLabel(account: RefundAccount): string {
  const number =
    account.type === 'gcash'
      ? account.accountNumber.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3')
      : account.accountNumber;
  return `${account.type === 'gcash' ? 'GCash' : account.bank} ${number} · ${account.accountName}`;
}

/** Maps a stored `refundTo` map; undefined when it is missing or incomplete. */
export function toRefundAccount(data: DocumentData | undefined): RefundAccount | undefined {
  const type = data?.['type'];
  const accountName = text(data?.['accountName']);
  const accountNumber = text(data?.['accountNumber']);
  if ((type !== 'gcash' && type !== 'bank') || !accountName || !accountNumber) return undefined;
  return type === 'bank'
    ? { type, bank: text(data?.['bank']) ?? 'Bank', accountName, accountNumber }
    : { type, accountName, accountNumber };
}

/** How each way of paying is called on the screens. */
export const PAYMENT_PROVIDER_LABELS: Record<PaymentProvider, string> = {
  paymongo: 'PayMongo',
  manual: 'Bank / GCash transfer',
  onsite: 'On site',
};

const STATUSES: readonly PaymentStatus[] = ['Unpaid', 'Paid', 'Refunded'];
const PROVIDERS: readonly PaymentProvider[] = ['paymongo', 'manual', 'onsite'];
const MANUAL_STATES: readonly ManualPaymentState[] = [
  'awaiting',
  'submitted',
  'rejected',
  'approved',
];
const ONSITE_METHODS: readonly OnsiteMethod[] = ['cash', 'gcash', 'bank', 'card'];

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function toReceiverSnapshot(data: DocumentData | undefined): ReceiverSnapshot {
  const receiver = data ?? {};
  return {
    type: receiver['type'] === 'bank' ? 'bank' : 'gcash',
    label: String(receiver['label'] ?? ''),
    bankName: String(receiver['bankName'] ?? ''),
    accountName: String(receiver['accountName'] ?? ''),
    accountNumber: String(receiver['accountNumber'] ?? ''),
  };
}

function toAttempt(data: DocumentData): ManualPaymentAttempt {
  return {
    receiverId: String(data['receiverId'] ?? ''),
    receiver: toReceiverSnapshot(data['receiver']),
    referenceNumber: String(data['referenceNumber'] ?? ''),
    amountSent: Number(data['amountSent']) || 0,
    sentAt: isoOf(data['sentAt']),
    proofPath: String(data['proofPath'] ?? ''),
    submittedAt: isoOf(data['submittedAt']),
    reviewedAt: isoOf(data['reviewedAt']) || undefined,
    reviewedByName: text(data['reviewedByName']),
    rejectReason: text(data['rejectReason']),
  };
}

function toManual(data: DocumentData | undefined): ManualPayment | undefined {
  if (!data) return undefined;
  const state: ManualPaymentState = MANUAL_STATES.includes(data['state'])
    ? data['state']
    : 'awaiting';
  const history = Array.isArray(data['history'])
    ? (data['history'] as DocumentData[]).map(toAttempt)
    : [];
  return data['proofPath'] ? { ...toAttempt(data), state, history } : { state, history };
}

function toOnsite(data: DocumentData | undefined): OnsitePayment | undefined {
  if (!data) return undefined;
  return {
    method: ONSITE_METHODS.includes(data['method']) ? data['method'] : 'cash',
    receiptNumber: String(data['receiptNumber'] ?? ''),
    recordedByName: String(data['recordedByName'] ?? ''),
    recordedAt: isoOf(data['recordedAt']) || undefined,
  };
}

/** Maps a stored `payment` map (order or booking) to the app's shape. */
export function toPayment(data: DocumentData | undefined): Payment {
  const payment = data ?? {};
  return {
    provider: PROVIDERS.includes(payment['provider'])
      ? payment['provider']
      : DEFAULT_PAYMENT_PROVIDER,
    status: STATUSES.includes(payment['status']) ? payment['status'] : 'Unpaid',
    amount: Number(payment['amount']) || 0,
    method: text(payment['method']),
    checkoutSessionId: text(payment['checkoutSessionId']),
    checkoutUrl: text(payment['checkoutUrl']),
    paymentId: text(payment['paymentId']),
    paidAt: isoOf(payment['paidAt']) || undefined,
    refundId: text(payment['refundId']),
    refundedAt: isoOf(payment['refundedAt']) || undefined,
    refundReference: text(payment['refundReference']),
    refundProofPath: text(payment['refundProofPath']),
    refundNote: text(payment['refundNote']),
    manual: toManual(payment['manual']),
    onsite: toOnsite(payment['onsite']),
  };
}

/** Maps a stored `invoice` map (order or booking); undefined until an invoice number was given. */
export function toInvoice(data: DocumentData | undefined): InvoiceInfo | undefined {
  const number = text(data?.['number']);
  if (!number) return undefined;
  return {
    number,
    sentAt: isoOf(data!['sentAt']) || undefined,
    sentTo: text(data!['sentTo']),
    sentByName: text(data!['sentByName']),
    sendCount: Number(data!['sendCount']) || 0,
  };
}

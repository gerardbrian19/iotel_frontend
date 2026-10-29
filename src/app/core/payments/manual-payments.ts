import type { Badge } from '../orders/order-view';
import { OnsiteMethod, Payment, PaymentReceiver, ReceiverSnapshot } from '../models';

/** Largest transfer screenshot. Mirrored in storage.rules and functions/src/manual-payments.ts. */
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
/** Largest QR image. Mirrored in storage.rules. */
export const MAX_QR_BYTES = 2 * 1024 * 1024;
/** Image types accepted for proofs and QR codes (storage.rules). */
export const PROOF_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** How a reference number must look (functions/src/manual-payments.ts). */
export const REFERENCE_PATTERN = /^[A-Za-z0-9-]{4,40}$/;
/**
 * A transfer can be dated from the start (midnight, Philippine time) of the day `TRANSFER_DAYS_BEFORE` days before
 * the order was placed (or the booking quoted), up to `TRANSFER_WINDOW_DAYS` days after it, and never in the future.
 * Mirrored in functions/src/manual-payments.ts.
 */
export const TRANSFER_WINDOW_DAYS = 3;
export const TRANSFER_DAYS_BEFORE = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Philippine time is UTC+8 all year (no daylight saving). */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** The earliest and latest "date and time sent" accepted for a transfer, from when the payment became due. */
export function transferWindow(
  dueSince: string | undefined,
  now = new Date(),
): { from: Date; to: Date } {
  const start = dueSince ? new Date(dueSince).getTime() : now.getTime();
  const startOfDay = Math.floor((start + MANILA_OFFSET_MS) / DAY_MS) * DAY_MS - MANILA_OFFSET_MS;
  const end = start + TRANSFER_WINDOW_DAYS * DAY_MS;
  return {
    from: new Date(startOfDay - TRANSFER_DAYS_BEFORE * DAY_MS),
    to: new Date(Math.min(end, now.getTime())),
  };
}

/** Account / mobile numbers of a receiver (`validReceiver` in firestore.rules). */
export const ACCOUNT_NUMBER_PATTERN = /^[0-9][0-9 -]{3,39}$/;

/** Philippine banks admins can pick for a bank receiver; any other name can be typed in. */
export const PH_BANKS: readonly string[] = [
  'BPI',
  'BDO',
  'Metrobank',
  'EastWest',
  'Landbank',
  'PNB',
  'Security Bank',
  'UnionBank',
  'RCBC',
  'China Bank',
  'PSBank',
  'AUB',
  'Maybank',
];

export const ONSITE_METHOD_OPTIONS: readonly { value: OnsiteMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
];

/** "GCash" or "BPI", for a receiver or the copy kept on a payment. */
export function receiverTitle(receiver: Pick<ReceiverSnapshot, 'type' | 'bankName'>): string {
  return receiver.type === 'bank' ? receiver.bankName || 'Bank' : 'GCash';
}

/** The option shown to customers: its label, or the bank / GCash name. */
export function receiverLabel(
  receiver: Pick<PaymentReceiver, 'type' | 'bankName' | 'label'>,
): string {
  return receiver.label || receiverTitle(receiver);
}

/** `•••• 4567`, for tables where the full number isn't needed. */
export function maskAccountNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length > 4 ? `•••• ${digits.slice(-4)}` : value;
}

/** A transfer proof is waiting for staff. */
export function proofUnderReview(payment: Payment | undefined): boolean {
  return payment?.status === 'Unpaid' && payment.manual?.state === 'submitted';
}

/** The customer can send (or send again) a transfer proof for this payment. */
export function canSendProof(payment: Payment | undefined): boolean {
  return (
    payment?.provider === 'manual' &&
    payment.status === 'Unpaid' &&
    (payment.manual?.state === 'awaiting' || payment.manual?.state === 'rejected')
  );
}

/** The badge for an unpaid transfer or on-site payment, or null for anything else. */
export function manualPaymentBadge(payment: Payment | undefined): Badge | null {
  if (!payment || payment.status !== 'Unpaid') return null;
  if (payment.provider === 'onsite') return { label: 'Pay on site', color: 'blue' };
  if (payment.provider !== 'manual') return null;
  switch (payment.manual?.state) {
    case 'submitted':
      return { label: 'Verifying payment', color: 'processing' };
    case 'rejected':
      return { label: 'Payment not verified', color: 'error' };
    default:
      return { label: 'Send payment', color: 'warning' };
  }
}

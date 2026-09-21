import { PaymentMethod, PaymentProvider } from '../models';

/**
 * How payments are collected. This file and `OrderService` are the only places that know it, so the move to PayMongo
 * (orders now, service bookings later) stays contained:
 *
 * - Today the customer pays outside the app (GCash / bank transfer), types the reference number from their receipt, and
 *   staff verify it by hand (`payment.provider = 'manual'`).
 * - With PayMongo the order is created unpaid (`provider = 'paymongo'`), the customer is sent to PayMongo's checkout,
 *   and a backend webhook marks `payment.status` as `Paid`. Customers can never set `Paid` themselves (see
 *   `firestore.rules`), so nothing in the order flow, the staff screens or the rules has to change shape.
 */
export const PAYMENT_PROVIDER: PaymentProvider = 'manual';

export interface PaymentOption {
  method: PaymentMethod;
  icon: string;
  /** Where to send the money, or what to expect. */
  details: string;
  /** The customer has to enter the reference number of their transfer. */
  needsReference: boolean;
}

export const PAYMENT_OPTIONS: readonly PaymentOption[] = [
  {
    method: 'GCash',
    icon: '📱',
    details: 'Send to GCash: 0917-123-4567 (Goldcomm Corp)',
    needsReference: true,
  },
  {
    method: 'Bank Transfer',
    icon: '🏦',
    details: 'BPI: 1234-5678-90 | Goldcomm Corp',
    needsReference: true,
  },
  {
    method: 'Cash on Delivery',
    icon: '💵',
    details: 'Pay in cash when your order arrives',
    needsReference: false,
  },
];

export function paymentOption(method: PaymentMethod): PaymentOption {
  return PAYMENT_OPTIONS.find((option) => option.method === method) ?? PAYMENT_OPTIONS[0];
}

/** Payments that need a reference number, which staff verify. */
export function needsReference(method: PaymentMethod): boolean {
  return paymentOption(method).needsReference;
}

export const REFERENCE_MIN_LENGTH = 6;
export const REFERENCE_MAX_LENGTH = 40;
export const REFERENCE_HELP = `Enter the ${REFERENCE_MIN_LENGTH} to ${REFERENCE_MAX_LENGTH} character reference from your receipt (letters, numbers, spaces or dashes).`;

/** Null when the reference looks right, otherwise what is wrong with it. */
export function referenceError(value: string): string | null {
  const reference = value.trim();
  if (!reference) return 'Enter the reference number from your receipt.';
  if (reference.length < REFERENCE_MIN_LENGTH || reference.length > REFERENCE_MAX_LENGTH)
    return REFERENCE_HELP;
  if (!/^[A-Za-z0-9 -]+$/.test(reference)) return REFERENCE_HELP;
  return null;
}

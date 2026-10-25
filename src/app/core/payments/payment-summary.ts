import { Booking, Order, Payment } from '../models';
import { hasOpenCancelRequest } from '../orders/order-view';
import { proofUnderReview } from './manual-payments';
import { PAYMENT_PROVIDER_LABELS, paymentMethodLabel } from './payment-methods';

export interface MoneyCount {
  amount: number;
  count: number;
}

/** Revenue channels the dashboard keeps apart, whichever way (PayMongo, transfer, on site) the money came in. */
export type RevenueChannel = 'gcash' | 'bank' | 'cash' | 'other';

export const REVENUE_CHANNELS: readonly { key: RevenueChannel; label: string }[] = [
  { key: 'gcash', label: 'GCash' },
  { key: 'bank', label: 'Bank transfer' },
  { key: 'cash', label: 'Cash' },
  { key: 'other', label: 'Cards & other e-wallets' },
];

/** `gcash` (PayMongo or transfer), `bank:<Bank>` / `bank` / online banking, `cash`; the rest is card, Maya, etc. */
export function revenueChannel(method: string | undefined): RevenueChannel {
  if (method === 'gcash') return 'gcash';
  if (method === 'bank' || method?.startsWith('bank:') || method?.startsWith('dob')) return 'bank';
  if (method === 'cash') return 'cash';
  return 'other';
}

export interface PaymentSummary {
  /** Paid and not refunded, orders and bookings together. */
  collected: MoneyCount;
  /** Of `collected`, paid since the start of the current month. */
  collectedThisMonth: MoneyCount;
  collectedOrders: MoneyCount;
  collectedBookings: MoneyCount;
  refunded: MoneyCount;
  /** Open checkouts: pending unpaid orders and quoted bookings not paid yet. */
  awaiting: MoneyCount;
  /** Paid but cancelled (e.g. paid after the order expired): staff still have to refund these. */
  toRefund: MoneyCount;
  /** Transfer proofs waiting for staff to check them. */
  toVerify: MoneyCount;
  /** Paid orders customers asked to cancel, waiting for a decision. */
  cancelRequests: MoneyCount;
  /** Collected money per revenue channel, in `REVENUE_CHANNELS` order, all channels present. */
  byChannel: { key: RevenueChannel; label: string; amount: number; count: number; share: number }[];
  /** Collected money by payment method, largest first. */
  byMethod: { label: string; amount: number; count: number; pct: number }[];
  /** Collected money by way of paying (PayMongo, transfer, on site), largest first. */
  byProvider: { label: string; amount: number; count: number; pct: number }[];
}

function add(target: MoneyCount, amount: number): void {
  target.amount += amount;
  target.count++;
}

const zero = (): MoneyCount => ({ amount: 0, count: 0 });

/** Payment figures for the admin dashboard, from the live orders and bookings. */
export function paymentSummary(
  orders: readonly Order[],
  bookings: readonly Booking[],
  now = new Date(),
): PaymentSummary {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const summary: Omit<PaymentSummary, 'byMethod' | 'byProvider' | 'byChannel'> = {
    collected: zero(),
    collectedThisMonth: zero(),
    collectedOrders: zero(),
    collectedBookings: zero(),
    refunded: zero(),
    awaiting: zero(),
    toRefund: zero(),
    toVerify: zero(),
    cancelRequests: zero(),
  };
  const methods = new Map<string, MoneyCount>();
  const providers = new Map<string, MoneyCount>();
  const channels = new Map<RevenueChannel, MoneyCount>(
    REVENUE_CHANNELS.map((c) => [c.key, zero()]),
  );

  const record = (payment: Payment, cancelled: boolean, source: MoneyCount) => {
    if (payment.status === 'Refunded') {
      add(summary.refunded, payment.amount);
      return;
    }
    if (payment.status !== 'Paid') return;
    add(summary.collected, payment.amount);
    add(source, payment.amount);
    if (payment.paidAt && payment.paidAt >= monthStart)
      add(summary.collectedThisMonth, payment.amount);
    if (cancelled) add(summary.toRefund, payment.amount);
    const label = paymentMethodLabel(payment.method) || 'Other';
    const entry = methods.get(label) ?? zero();
    add(entry, payment.amount);
    methods.set(label, entry);
    add(channels.get(revenueChannel(payment.method))!, payment.amount);
    const way = PAYMENT_PROVIDER_LABELS[payment.provider];
    const byWay = providers.get(way) ?? zero();
    add(byWay, payment.amount);
    providers.set(way, byWay);
  };

  for (const order of orders) {
    record(order.payment, order.status === 'Cancelled', summary.collectedOrders);
    if (proofUnderReview(order.payment)) add(summary.toVerify, order.payment.amount);
    if (hasOpenCancelRequest(order)) add(summary.cancelRequests, order.payment.amount);
    if (order.status === 'Pending' && order.payment.status === 'Unpaid') {
      add(summary.awaiting, order.payment.amount || order.total);
    }
  }
  for (const booking of bookings) {
    if (booking.payment) {
      record(booking.payment, booking.status === 'Cancelled', summary.collectedBookings);
      if (proofUnderReview(booking.payment)) add(summary.toVerify, booking.payment.amount);
    }
    if (booking.status === 'Confirmed' && booking.payment?.status !== 'Paid') {
      add(summary.awaiting, booking.quote?.amount ?? 0);
    }
  }

  const byChannel = REVENUE_CHANNELS.map(({ key, label }) => {
    const m = channels.get(key)!;
    const share = summary.collected.amount ? (m.amount / summary.collected.amount) * 100 : 0;
    return { key, label, ...m, share };
  });
  return { ...summary, byChannel, byMethod: ranked(methods), byProvider: ranked(providers) };
}

/** Largest first, with each one's share of the largest for the bars. */
function ranked(groups: ReadonlyMap<string, MoneyCount>) {
  const top = Math.max(0, ...[...groups.values()].map((m) => m.amount));
  return [...groups]
    .map(([label, m]) => ({ label, ...m, pct: top ? (m.amount / top) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

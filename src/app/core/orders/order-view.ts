import { Order, OrderStatus } from '../models';

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  Pending: 'warning',
  Processing: 'processing',
  Shipped: 'blue',
  Delivered: 'success',
  Cancelled: 'error',
};

export interface Badge {
  label: string;
  color: string;
}

export function paymentBadge(order: Order): Badge {
  const { method, status } = order.payment;
  switch (status) {
    case 'Paid':
      return { label: 'Paid', color: 'success' };
    case 'Submitted':
      return { label: 'Payment under review', color: 'processing' };
    case 'Rejected':
      return { label: 'Payment rejected', color: 'error' };
    default:
      return method === 'Cash on Delivery'
        ? { label: 'Pay on delivery', color: 'default' }
        : { label: 'Unpaid', color: 'warning' };
  }
}

/** Cash on Delivery is settled when it arrives, so it needs nothing verified before staff start on it. */
export function isPaymentSettled(order: Order): boolean {
  return order.payment.status === 'Paid' || order.payment.method === 'Cash on Delivery';
}

/** The customer can cancel until staff have verified their payment (or accepted a Cash on Delivery order). */
export function customerCanCancel(order: Order): boolean {
  return order.status === 'Pending' && order.payment.status !== 'Paid';
}

/** What staff have to do to move the order along, or null when it is waiting on someone else or finished. */
export type StaffAction = 'verify-payment' | 'start-processing' | 'ship' | 'deliver';

export function staffAction(order: Order): StaffAction | null {
  switch (order.status) {
    case 'Pending':
      if (order.payment.status === 'Submitted') return 'verify-payment';
      return isPaymentSettled(order) ? 'start-processing' : null;
    case 'Processing':
      return 'ship';
    case 'Shipped':
      return 'deliver';
    default:
      return null;
  }
}

/** One line on what happens next, from the viewer's side. */
export function orderHint(order: Order, staff: boolean): string {
  const { payment } = order;
  switch (order.status) {
    case 'Cancelled':
      return order.cancelledBy === 'customer'
        ? 'This order was cancelled by the customer.'
        : 'This order was cancelled by our team.';
    case 'Delivered':
      return staff ? 'Delivered to the customer.' : 'Delivered. Thank you for shopping with IOTEL!';
    case 'Shipped':
      return staff
        ? 'With the courier. Mark it delivered once the customer has it.'
        : `On its way with ${order.shipment?.courier ?? 'the courier'}.`;
    case 'Processing':
      return staff
        ? 'Pack the items, then hand the parcel to the courier and mark it shipped.'
        : 'We are preparing your order for shipping.';
    default:
      if (payment.status === 'Submitted') {
        return staff
          ? `Check ${payment.method} reference ${payment.referenceNumber} against your records, then verify or reject it.`
          : 'We received your payment details and will verify them shortly.';
      }
      if (payment.status === 'Rejected') {
        return staff
          ? 'Waiting for the customer to submit their payment again.'
          : `We could not verify your payment${payment.rejectionReason ? `: ${payment.rejectionReason}` : '.'} Please submit the reference number again.`;
      }
      if (staff) {
        return `${payment.status === 'Paid' ? 'Payment verified' : 'Cash on Delivery'}. Start processing to take the items out of stock.`;
      }
      return payment.status === 'Paid'
        ? 'Payment verified. We will start preparing your order soon.'
        : 'Your order is placed. We will start preparing it soon.';
  }
}

export interface TimelineStep {
  label: string;
  detail?: string;
  /** ISO time the step happened, when known. */
  date?: string;
  state: 'done' | 'current' | 'todo' | 'error';
}

/** The order's progress as a list of steps, for the tracker. */
export function orderTimeline(order: Order): TimelineStep[] {
  const cancelled = order.status === 'Cancelled';
  const { payment } = order;
  const steps: TimelineStep[] = [{ label: 'Order placed', date: order.createdAt, state: 'done' }];

  if (payment.method !== 'Cash on Delivery') {
    if (payment.status === 'Paid') {
      steps.push({ label: 'Payment verified', date: payment.paidAt, state: 'done' });
    } else if (payment.status === 'Rejected') {
      steps.push({ label: 'Payment rejected', detail: payment.rejectionReason, state: 'error' });
    } else if (!cancelled) {
      steps.push({ label: 'Payment verification', detail: 'Waiting for our team', state: 'todo' });
    }
  }

  const rank: Record<OrderStatus, number> = {
    Pending: 0,
    Processing: 1,
    Shipped: 2,
    Delivered: 3,
    Cancelled: -1,
  };
  const flow: { status: OrderStatus; label: string; date?: string; detail?: string }[] = [
    { status: 'Processing', label: 'Processing', date: order.processedAt },
    {
      status: 'Shipped',
      label: 'Shipped',
      date: order.shippedAt,
      detail: order.shipment
        ? [order.shipment.courier, order.shipment.trackingNumber].filter(Boolean).join(' · ')
        : undefined,
    },
    { status: 'Delivered', label: 'Delivered', date: order.deliveredAt },
  ];
  for (const step of flow) {
    const reached = rank[order.status] >= rank[step.status] || (cancelled && !!step.date);
    // A cancelled order only lists what actually happened.
    if (cancelled && !reached) continue;
    steps.push({
      label: step.label,
      detail: step.detail,
      date: step.date,
      state: reached ? 'done' : 'todo',
    });
  }

  if (cancelled) {
    steps.push({
      label: 'Cancelled',
      detail: order.cancelReason,
      date: order.cancelledAt,
      state: 'error',
    });
  } else {
    // The first step still ahead is the one in progress.
    const next = steps.find((step) => step.state === 'todo');
    if (next && steps.every((step) => step.state !== 'error')) next.state = 'current';
  }
  return steps;
}

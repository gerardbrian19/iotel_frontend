import { Order, OrderStatus } from '../models';
import { UNPAID_ORDER_MINUTES, paymentMethodLabel } from '../payments/payment-methods';

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
  switch (order.payment.status) {
    case 'Paid':
      return { label: 'Paid', color: 'success' };
    case 'Refunded':
      return { label: 'Refunded', color: 'default' };
    default:
      return order.status === 'Cancelled'
        ? { label: 'Not paid', color: 'default' }
        : { label: 'Awaiting payment', color: 'warning' };
  }
}

/** PayMongo confirmed the payment, so staff can start on the order. */
export function isPaymentSettled(order: Order): boolean {
  return order.payment.status === 'Paid';
}

/** Customers (and staff, without a refund) can cancel an order until it has been paid. */
export function customerCanCancel(order: Order): boolean {
  return order.status === 'Pending' && order.payment.status === 'Unpaid';
}

/** The customer can (still) pay: pending, unpaid and the PayMongo checkout is open. */
export function canPay(order: Order): boolean {
  return customerCanCancel(order) && !!order.payment.checkoutUrl;
}

/** Staff can refund a paid order that hasn't left the shop, or one that was paid after it was cancelled. */
export function canRefund(order: Order): boolean {
  return (
    order.payment.status === 'Paid' &&
    (order.status === 'Pending' || order.status === 'Processing' || order.status === 'Cancelled')
  );
}

/** What staff have to do to move the order along, or null when it is waiting on someone else or finished. */
export type StaffAction = 'start-processing' | 'ship' | 'deliver' | 'refund';

export function staffAction(order: Order): StaffAction | null {
  switch (order.status) {
    case 'Pending':
      return isPaymentSettled(order) ? 'start-processing' : null;
    case 'Processing':
      return 'ship';
    case 'Shipped':
      return 'deliver';
    case 'Cancelled':
      // Paid after it was cancelled (e.g. the checkout was completed late): the money has to go back.
      return order.payment.status === 'Paid' ? 'refund' : null;
    default:
      return null;
  }
}

/** One line on what happens next, from the viewer's side. */
export function orderHint(order: Order, staff: boolean): string {
  const { payment } = order;
  switch (order.status) {
    case 'Cancelled': {
      const by =
        order.cancelledBy === 'customer'
          ? 'This order was cancelled by the customer.'
          : order.cancelledBy === 'system'
            ? 'This order was cancelled because it was not paid in time.'
            : 'This order was cancelled by our team.';
      if (payment.status === 'Paid') {
        return staff
          ? `${by} It was paid anyway, so refund the payment.`
          : `${by} We received a payment for it and will refund it.`;
      }
      if (payment.status === 'Refunded') return `${by} The payment was refunded.`;
      return by;
    }
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
      if (payment.status === 'Paid') {
        return staff
          ? 'Paid through PayMongo. Start processing to take the items out of stock.'
          : 'Payment received. We will start preparing your order soon.';
      }
      return staff
        ? 'Waiting for the customer to pay through PayMongo.'
        : `Waiting for your payment. Unpaid orders are cancelled after ${UNPAID_ORDER_MINUTES} minutes.`;
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

  if (payment.status === 'Paid' || payment.status === 'Refunded') {
    steps.push({
      label: 'Payment received',
      detail: paymentMethodLabel(payment.method) || undefined,
      date: payment.paidAt,
      state: 'done',
    });
  } else if (!cancelled) {
    steps.push({ label: 'Payment', detail: 'Waiting for your PayMongo payment', state: 'todo' });
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
    if (payment.status === 'Refunded') {
      steps.push({ label: 'Refunded', date: payment.refundedAt, state: 'done' });
    }
  } else {
    // The first step still ahead is the one in progress.
    const next = steps.find((step) => step.state === 'todo');
    if (next && steps.every((step) => step.state !== 'error')) next.state = 'current';
  }
  return steps;
}

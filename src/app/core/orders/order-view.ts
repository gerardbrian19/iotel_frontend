import { Order, OrderStatus } from '../models';
import { UNPAID_ORDER_MINUTES, paymentMethodLabel } from '../payments/payment-methods';
import {
  canSendProof,
  manualPaymentBadge,
  proofUnderReview,
  receiverTitle,
} from '../payments/manual-payments';

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  Pending: 'warning',
  Processing: 'processing',
  Shipped: 'blue',
  'Out for Delivery': 'cyan',
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
      if (order.status === 'Cancelled') return { label: 'Not paid', color: 'default' };
      return manualPaymentBadge(order.payment) ?? { label: 'Awaiting payment', color: 'warning' };
  }
}

/** The payment is confirmed (by PayMongo, or by staff for a transfer), so staff can start on the order. */
export function isPaymentSettled(order: Order): boolean {
  return order.payment.status === 'Paid';
}

/**
 * Customers (and staff, without a refund) can cancel an order until it has been paid, except while a transfer proof
 * is being checked: staff approve or reject it first.
 */
export function customerCanCancel(order: Order): boolean {
  return (
    order.status === 'Pending' &&
    order.payment.status === 'Unpaid' &&
    !proofUnderReview(order.payment)
  );
}

/** The customer can (still) pay through PayMongo: pending, unpaid and the checkout is open. */
export function canPay(order: Order): boolean {
  return (
    customerCanCancel(order) && order.payment.provider === 'paymongo' && !!order.payment.checkoutUrl
  );
}

/** The customer still has to send (or resend) the proof of their transfer. */
export function canSubmitProof(order: Order): boolean {
  return order.status === 'Pending' && canSendProof(order.payment);
}

/** Staff can refund a paid order that hasn't left the shop, or one that was paid after it was cancelled. */
export function canRefund(order: Order): boolean {
  return (
    order.payment.status === 'Paid' &&
    (order.status === 'Pending' || order.status === 'Processing' || order.status === 'Cancelled')
  );
}

/** The customer can ask to cancel a paid order that hasn't shipped (staff then refund it or say no). */
export function canRequestCancel(order: Order): boolean {
  return (
    order.payment.status === 'Paid' &&
    (order.status === 'Pending' || order.status === 'Processing') &&
    order.cancelRequest?.status !== 'pending'
  );
}

/** A cancellation request staff still have to approve or reject. */
export function hasOpenCancelRequest(order: Order): boolean {
  return order.cancelRequest?.status === 'pending' && order.status !== 'Cancelled';
}

/** What staff have to do to move the order along, or null when it is waiting on someone else or finished. */
export type StaffAction =
  | 'verify-payment'
  | 'review-cancel'
  | 'start-processing'
  | 'ship'
  | 'out-for-delivery'
  | 'deliver'
  | 'refund';

export function staffAction(order: Order): StaffAction | null {
  if (hasOpenCancelRequest(order)) return 'review-cancel';
  switch (order.status) {
    case 'Pending':
      if (proofUnderReview(order.payment)) return 'verify-payment';
      return isPaymentSettled(order) ? 'start-processing' : null;
    case 'Processing':
      return 'ship';
    case 'Shipped':
      return 'out-for-delivery';
    case 'Out for Delivery':
      return 'deliver';
    case 'Cancelled':
      // Paid after it was cancelled (e.g. the checkout was completed late): the money has to go back.
      return order.payment.status === 'Paid' ? 'refund' : null;
    default:
      return null;
  }
}

/** One line on what happens next, from the viewer's side. */
/** "123 Rizal St, Makati City, Metro Manila 1200": where the parcel goes. */
export function deliveryAddress(order: Order): string {
  const { addressLine, city, province, zip } = order.address;
  return [addressLine, city, [province, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

export function orderHint(order: Order, staff: boolean): string {
  const { payment } = order;
  if (hasOpenCancelRequest(order)) {
    return staff
      ? 'The customer asked to cancel this order. Approve (refund) or reject the request before moving it along.'
      : 'You asked to cancel this order. We will review your request and let you know here.';
  }
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
    case 'Out for Delivery':
      return staff
        ? `Out for delivery to ${deliveryAddress(order)}. Mark it delivered once the customer has it.`
        : `Your order is out for delivery to ${deliveryAddress(order)}.`;
    case 'Shipped':
      return staff
        ? 'With the courier. Mark it out for delivery when it leaves for the customer.'
        : `On its way with ${order.shipment?.courier ?? 'the courier'}.`;
    case 'Processing':
      return staff
        ? 'Pack the items, then hand the parcel to the courier and mark it shipped.'
        : 'We are preparing your order for shipping.';
    default:
      if (payment.status === 'Paid') {
        return staff
          ? `Paid${payment.provider === 'manual' ? ' by transfer (verified)' : ' through PayMongo'}. Start processing to take the items out of stock.`
          : 'Payment received. We will start preparing your order soon.';
      }
      if (payment.provider === 'manual') {
        switch (payment.manual?.state) {
          case 'submitted':
            return staff
              ? 'The customer sent a transfer. Check that it arrived, then approve or reject it.'
              : 'We received your proof of payment and are checking it. This usually takes a few hours during business hours.';
          case 'rejected':
            return staff
              ? 'The transfer could not be verified. Waiting for the customer to send it again.'
              : `We couldn't verify your payment: ${payment.manual.rejectReason ?? ''} Please check it and send it again.`;
          default:
            return staff
              ? 'Waiting for the customer to send a bank / GCash transfer.'
              : 'Send the amount to one of our accounts below, then upload the screenshot and reference number.';
        }
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
      label: payment.provider === 'manual' ? 'Payment verified' : 'Payment received',
      detail:
        [paymentMethodLabel(payment.method), payment.provider === 'manual' ? payment.paymentId : '']
          .filter(Boolean)
          .join(' · ') || undefined,
      date: payment.paidAt,
      state: 'done',
    });
  } else if (!cancelled) {
    if (payment.provider === 'manual') {
      const manual = payment.manual;
      if (manual?.state === 'submitted' || manual?.state === 'rejected') {
        steps.push({
          label: 'Payment sent',
          detail: manual.receiver
            ? `${receiverTitle(manual.receiver)} · ref ${manual.referenceNumber}`
            : undefined,
          date: manual.submittedAt,
          state: 'done',
        });
      }
      steps.push({
        label: manual?.state === 'rejected' ? 'Payment not verified' : 'Payment check',
        detail:
          manual?.state === 'rejected'
            ? manual.rejectReason
            : manual?.state === 'submitted'
              ? 'Our team is checking your transfer'
              : 'Waiting for your transfer',
        state: manual?.state === 'rejected' ? 'error' : 'todo',
      });
    } else {
      steps.push({ label: 'Payment', detail: 'Waiting for your PayMongo payment', state: 'todo' });
    }
  }

  const rank: Record<OrderStatus, number> = {
    Pending: 0,
    Processing: 1,
    Shipped: 2,
    'Out for Delivery': 3,
    Delivered: 4,
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
    {
      status: 'Out for Delivery',
      label: 'Out for delivery',
      date: order.outForDeliveryAt,
      detail: order.outForDeliveryAt ? `To ${deliveryAddress(order)}` : undefined,
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

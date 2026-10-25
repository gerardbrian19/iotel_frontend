/**
 * The activity log (`activityLog/{id}`): who did what and when, for the admin Activity page and dashboard.
 *
 * Entries are written here, on the server, by triggers that watch orders, bookings, products, services, payment
 * receivers and user profiles, so nothing done in the app can skip them. Firestore tells a trigger which signed-in user made the change
 * (`authId`); changes made by these functions themselves (checkout, PayMongo's webhook, refunds, unpaid-order expiry)
 * are attributed from the document instead (the customer who placed the order, `payment.refundedBy`, or "System").
 * The admin account functions in auth.ts log their own entries with `logActivity`, and each app session records its
 * own sign-in (the only entry clients may create; see firestore.rules).
 *
 * Mirrors `ActivityEntry` in src/app/core/models/activity.model.ts.
 */
import { DocumentData, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
  FirestoreAuthEvent,
  onDocumentWrittenWithAuthContext,
  Change,
  DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { db } from './app.js';
import { methodLabel } from './payment-common.js';

export type ActivityCategory =
  | 'order'
  | 'payment'
  | 'booking'
  | 'inventory'
  | 'product'
  | 'service'
  | 'account';

export interface Actor {
  id: string | null;
  name: string;
  /** `customer` | `staff` | `admin`, or `system` for automatic changes. */
  role: string;
}

export interface ActivityInput {
  category: ActivityCategory;
  /** Machine-readable kind, e.g. `order.shipped`. */
  action: string;
  /** One readable sentence, e.g. "Shipped ORD-0007 via LBC". */
  summary: string;
  actor: Actor;
  targetType: 'order' | 'booking' | 'product' | 'service' | 'user' | 'receiver';
  targetId: string;
  /** What people call the target, e.g. `ORD-0007` or a product name. */
  targetLabel: string;
  /** Pesos, for payments and orders. */
  amount?: number;
}

const SYSTEM: Actor = { id: null, name: 'System', role: 'system' };
const PAYMONGO: Actor = { id: null, name: 'PayMongo', role: 'system' };

function entryData(input: ActivityInput, at: Timestamp): DocumentData {
  const { actor, ...rest } = input;
  return {
    ...rest,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    at,
  };
}

/** Writes one entry now. Used by functions that act for a known user (auth.ts). Never throws. */
export async function logActivity(input: ActivityInput): Promise<void> {
  try {
    await db.collection('activityLog').add(entryData(input, Timestamp.now()));
  } catch (err) {
    logger.error('Could not write activity entry', { action: input.action, err });
  }
}

/**
 * Writes a trigger's entries. Their ids derive from the event id, so a retried event overwrites instead of
 * duplicating.
 */
async function writeEntries(
  event: { id: string; time: string },
  entries: ActivityInput[],
): Promise<void> {
  if (!entries.length) return;
  const at = Timestamp.fromDate(new Date(event.time));
  const batch = db.batch();
  entries.forEach((entry, i) =>
    batch.set(db.doc(`activityLog/${event.id}-${i}`), entryData(entry, at)),
  );
  await batch.commit();
}

/** The profile behind a uid, read once per trigger run. */
function actorLookup() {
  const cache = new Map<string, Promise<Actor>>();
  return (uid: string): Promise<Actor> => {
    let actor = cache.get(uid);
    if (!actor) {
      actor = db
        .doc(`users/${uid}`)
        .get()
        .then((snap) => ({
          id: uid,
          name: String(snap.get('name') || snap.get('email') || 'Unknown user'),
          role: String(snap.get('role') || 'customer'),
        }));
      cache.set(uid, actor);
    }
    return actor;
  };
}

/**
 * The signed-in app user who made the change, or null when it came from a function or the console. Writes from our
 * own functions can arrive with the runtime's service account (`…@developer.gserviceaccount.com`) as `authId` and an
 * auth type outside the list, so service-account ids are never taken for app users.
 */
function appUserOf(event: FirestoreAuthEvent<unknown>): string | null {
  const type = event.authType as string;
  if (!event.authId || ['service_account', 'system', 'api_key', 'unauthenticated'].includes(type))
    return null;
  if (event.authId.endsWith('.gserviceaccount.com')) return null;
  return event.authId;
}

function peso(value: unknown): string {
  return `₱${(Number(value) || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
}

export function orderCode(number: unknown): string {
  return `ORD-${String(Number(number) || 0).padStart(4, '0')}`;
}

function viaMethod(method: unknown): string {
  const label = methodLabel(method);
  return label ? ` via ${label}` : '';
}

type ActorOf = (fallback?: Actor | string | null) => Promise<Actor>;

/**
 * The entries for a change of an order's or booking's `payment` other than its refund: a payment coming in (PayMongo,
 * a transfer staff verified, or money staff received on site), a transfer proof sent or rejected, and a booking
 * switched to on-site payment.
 */
async function paymentEntries(
  before: DocumentData,
  after: DocumentData,
  base: { targetType: 'order' | 'booking'; targetId: string; targetLabel: string },
  actor: ActorOf,
): Promise<ActivityInput[]> {
  const entries: ActivityInput[] = [];
  const was = before['payment'] ?? {};
  const now = after['payment'] ?? {};
  const manual = now['manual'] ?? {};
  const label = base.targetLabel;
  const amount = Number(now['amount']) || 0;

  if (
    manual['state'] === 'submitted' &&
    (was['manual']?.['state'] !== 'submitted' ||
      was['manual']?.['referenceNumber'] !== manual['referenceNumber'])
  ) {
    entries.push({
      ...base,
      category: 'payment',
      action: 'payment.proofSubmitted',
      summary: `Sent a transfer proof of ${peso(manual['amountSent'])} for ${label}${viaMethod(
        manual['receiver']?.['type'] === 'bank'
          ? `bank:${manual['receiver']['bankName']}`
          : 'gcash',
      )} (ref ${manual['referenceNumber']})`,
      actor: await actor(String(after['customerId'] ?? '')),
      amount: Number(manual['amountSent']) || 0,
    });
  }
  if (was['manual']?.['state'] === 'submitted' && manual['state'] === 'rejected') {
    entries.push({
      ...base,
      category: 'payment',
      action: 'payment.rejected',
      summary: `Rejected the transfer proof for ${label} (ref ${manual['referenceNumber']}): ${manual['rejectReason'] ?? ''}`,
      actor: await actor(manual['reviewedBy'] ?? null),
      amount,
    });
  }
  if (was['provider'] !== 'onsite' && now['provider'] === 'onsite' && now['status'] === 'Unpaid') {
    entries.push({
      ...base,
      category: 'payment',
      action: 'payment.onsiteChosen',
      summary: `Chose to pay ${peso(amount)} on site for ${label}`,
      actor: await actor(String(after['customerId'] ?? '')),
      amount,
    });
  }
  if (was['status'] !== 'Paid' && now['status'] === 'Paid') {
    const provider = now['provider'] ?? 'paymongo';
    entries.push({
      ...base,
      category: 'payment',
      action: 'payment.received',
      summary:
        provider === 'manual'
          ? `Verified a transfer of ${peso(amount)} for ${label}${viaMethod(now['method'])} (ref ${manual['referenceNumber']})`
          : provider === 'onsite'
            ? `Received ${peso(amount)} on site for ${label}${viaMethod(now['method'])}${
                now['onsite']?.['receiptNumber']
                  ? ` (receipt ${now['onsite']['receiptNumber']})`
                  : ''
              }`
            : `Payment of ${peso(amount)} received for ${label}${viaMethod(now['method'])}`,
      actor:
        provider === 'manual'
          ? await actor(manual['reviewedBy'] ?? null)
          : provider === 'onsite'
            ? await actor(now['onsite']?.['recordedBy'] ?? null)
            : PAYMONGO,
      amount,
    });
  }
  return entries;
}

/** " (sent back, ref X)" for a refund staff made themselves; nothing for a PayMongo refund. */
function refundRef(payment: DocumentData): string {
  return payment['refundReference'] ? ` (sent back, ref ${payment['refundReference']})` : '';
}

type WriteEvent = FirestoreAuthEvent<Change<DocumentSnapshot> | undefined, Record<string, string>>;

/** Runs `describe` for a document write and stores what it returns. Never throws: a log failure must not retry forever. */
function watch(
  document: string,
  describe: (
    before: DocumentData | undefined,
    after: DocumentData | undefined,
    id: string,
    actor: (fallback?: Actor | string | null) => Promise<Actor>,
  ) => Promise<ActivityInput[]> | ActivityInput[],
) {
  return onDocumentWrittenWithAuthContext(document, async (event: WriteEvent) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const id = event.data?.after.id ?? event.data?.before.id ?? '';
    const lookup = actorLookup();
    const by = appUserOf(event);
    // The app user who made the change; otherwise the fallback (a uid or a fixed actor); otherwise System.
    const actor = async (fallback?: Actor | string | null): Promise<Actor> => {
      if (by) return lookup(by);
      if (typeof fallback === 'string' && fallback) return lookup(fallback);
      return fallback && typeof fallback === 'object' ? fallback : SYSTEM;
    };
    try {
      await writeEntries(event, await describe(before, after, id, actor));
    } catch (err) {
      logger.error('Activity logging failed', { document: event.document, err });
    }
  });
}

// ── Orders ───────────────────────────────────────────────────────────────────

export const logOrderActivity = watch('orders/{orderId}', async (before, after, id, actor) => {
  if (!after) return [];
  const code = orderCode(after['number']);
  const base = { targetType: 'order' as const, targetId: id, targetLabel: code };
  const entries: ActivityInput[] = [];

  if (!before) {
    // Created by the checkout function on the customer's behalf.
    entries.push({
      ...base,
      category: 'order',
      action: 'order.placed',
      summary: `Placed order ${code} (${peso(after['total'])})`,
      actor: await actor(String(after['customerId'] ?? '')),
      amount: Number(after['total']) || 0,
    });
    return entries;
  }

  const paymentBefore = before['payment']?.['status'];
  const paymentAfter = after['payment']?.['status'];
  const refunded = paymentBefore !== 'Refunded' && paymentAfter === 'Refunded';

  entries.push(...(await paymentEntries(before, after, base, actor)));
  if (refunded) {
    const cancelled = before['status'] !== 'Cancelled' && after['status'] === 'Cancelled';
    entries.push({
      ...base,
      category: 'payment',
      action: 'payment.refunded',
      summary: `Refunded ${peso(after['payment']['amount'])} for ${code}${refundRef(after['payment'])}${cancelled ? ' and cancelled it' : ''}${
        after['cancelReason'] && cancelled ? `: ${after['cancelReason']}` : ''
      }`,
      actor: await actor(after['payment']['refundedBy'] ?? null),
      amount: Number(after['payment']['amount']) || 0,
    });
  }

  if (before['status'] !== after['status'] && !refunded) {
    switch (after['status']) {
      case 'Processing':
        entries.push({
          ...base,
          category: 'order',
          action: 'order.processing',
          summary: `Started processing ${code} (items taken out of stock)`,
          actor: await actor(),
        });
        break;
      case 'Shipped': {
        const courier = after['shipment']?.['courier'];
        const tracking = after['shipment']?.['trackingNumber'];
        entries.push({
          ...base,
          category: 'order',
          action: 'order.shipped',
          summary: `Shipped ${code}${courier ? ` via ${courier}` : ''}${tracking ? ` (tracking ${tracking})` : ''}`,
          actor: await actor(),
        });
        break;
      }
      case 'Out for Delivery':
        entries.push({
          ...base,
          category: 'order',
          action: 'order.outForDelivery',
          summary: `Marked ${code} as out for delivery`,
          actor: await actor(),
        });
        break;
      case 'Delivered':
        entries.push({
          ...base,
          category: 'order',
          action: 'order.delivered',
          summary: `Marked ${code} as delivered`,
          actor: await actor(),
        });
        break;
      case 'Cancelled': {
        const reason = after['cancelReason'] ? `: ${after['cancelReason']}` : '';
        const automatic = after['cancelledBy'] === 'system';
        entries.push({
          ...base,
          category: 'order',
          action: 'order.cancelled',
          summary: automatic
            ? `${code} was cancelled automatically${reason}`
            : `Cancelled ${code}${reason}`,
          actor: automatic ? SYSTEM : await actor(),
        });
        break;
      }
    }
  }
  return entries;
});

// ── Bookings ─────────────────────────────────────────────────────────────────

export const logBookingActivity = watch(
  'bookings/{bookingId}',
  async (before, after, id, actor) => {
    if (!after) return [];
    const service = String(after['serviceName'] ?? 'Service');
    const customer = String(after['customerName'] ?? 'customer');
    const label = `${service} · ${customer}`;
    const when = `${after['preferredDate']} ${after['preferredTime']}`;
    const base = { targetType: 'booking' as const, targetId: id, targetLabel: label };
    const entries: ActivityInput[] = [];

    if (!before) {
      entries.push({
        ...base,
        category: 'booking',
        action: 'booking.requested',
        summary: `Booked ${service} for ${when}`,
        actor: await actor(String(after['customerId'] ?? '')),
      });
      return entries;
    }

    const paymentBefore = before['payment']?.['status'];
    const paymentAfter = after['payment']?.['status'];
    const paid = paymentBefore !== 'Paid' && paymentAfter === 'Paid';
    const refunded = paymentBefore !== 'Refunded' && paymentAfter === 'Refunded';

    entries.push(...(await paymentEntries(before, after, base, actor)));
    if (refunded) {
      const cancelled = before['status'] !== 'Cancelled' && after['status'] === 'Cancelled';
      entries.push({
        ...base,
        category: 'payment',
        action: 'payment.refunded',
        summary: `Refunded ${peso(after['payment']['amount'])} for ${label}${refundRef(after['payment'])}${cancelled ? ' and cancelled the booking' : ''}`,
        actor: await actor(after['payment']['refundedBy'] ?? null),
        amount: Number(after['payment']['amount']) || 0,
      });
    }

    const quoteBefore = before['quote']?.['amount'];
    const quoteAfter = after['quote']?.['amount'];
    if (
      before['status'] !== after['status'] &&
      !refunded &&
      !(paid && after['status'] === 'Paid')
    ) {
      switch (after['status']) {
        case 'Confirmed':
          entries.push({
            ...base,
            category: 'booking',
            action: 'booking.quoted',
            summary: `Sent a quote of ${peso(quoteAfter)} for ${label}`,
            actor: await actor(),
            amount: Number(quoteAfter) || 0,
          });
          break;
        case 'Completed':
          entries.push({
            ...base,
            category: 'booking',
            action: 'booking.completed',
            summary: `Marked ${label} as completed`,
            actor: await actor(),
          });
          break;
        case 'Cancelled':
          entries.push({
            ...base,
            category: 'booking',
            action: 'booking.cancelled',
            summary: `Cancelled the booking ${label}`,
            actor: await actor(),
          });
          break;
      }
    } else if (
      after['status'] === 'Confirmed' &&
      quoteBefore !== quoteAfter &&
      quoteAfter !== undefined
    ) {
      entries.push({
        ...base,
        category: 'booking',
        action: 'booking.requoted',
        summary: `Changed the quote for ${label}: ${peso(quoteBefore)} → ${peso(quoteAfter)}`,
        actor: await actor(),
        amount: Number(quoteAfter) || 0,
      });
    }

    if (
      before['preferredDate'] !== after['preferredDate'] ||
      before['preferredTime'] !== after['preferredTime']
    ) {
      entries.push({
        ...base,
        category: 'booking',
        action: 'booking.rescheduled',
        summary: `Moved ${label} from ${before['preferredDate']} ${before['preferredTime']} to ${when}`,
        actor: await actor(),
      });
    }
    return entries;
  },
);

// ── Products and inventory ───────────────────────────────────────────────────

/** Fields that change as a side effect or don't mean anything to a person reading the log. */
const QUIET_PRODUCT_FIELDS = new Set([
  'stock',
  'srp',
  'isActive',
  'updatedAt',
  'createdAt',
  'searchKeywords',
  // Moved by every product review (reviews.ts).
  'ratingSum',
  'ratingCount',
]);

function changedFields(
  before: DocumentData,
  after: DocumentData,
  quiet: ReadonlySet<string>,
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter(
    (key) => !quiet.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}

function priceText(value: unknown): string {
  return value === null || value === undefined || value === '' ? 'price on request' : peso(value);
}

export const logProductActivity = watch(
  'products/{productId}',
  async (before, after, id, actor) => {
    const name = String((after ?? before)?.['name'] ?? id);
    const base = { targetType: 'product' as const, targetId: id, targetLabel: name };
    if (!before && after) {
      return [
        {
          ...base,
          category: 'product',
          action: 'product.added',
          summary: `Added product ${name}`,
          actor: await actor(),
        },
      ];
    }
    if (before && !after) {
      return [
        {
          ...base,
          category: 'product',
          action: 'product.deleted',
          summary: `Deleted product ${name}`,
          actor: await actor(),
        },
      ];
    }
    if (!before || !after) return [];

    const entries: ActivityInput[] = [];
    const stockBefore = Number(before['stock']) || 0;
    const stockAfter = Number(after['stock']) || 0;
    if (stockBefore !== stockAfter) {
      entries.push({
        ...base,
        category: 'inventory',
        action: stockAfter > stockBefore ? 'inventory.increased' : 'inventory.decreased',
        summary: `Stock of ${name}: ${stockBefore} → ${stockAfter} (${stockAfter > stockBefore ? '+' : ''}${stockAfter - stockBefore})`,
        actor: await actor(),
      });
    }
    if ((before['srp'] ?? null) !== (after['srp'] ?? null)) {
      entries.push({
        ...base,
        category: 'product',
        action: 'product.price',
        summary: `Changed the price of ${name}: ${priceText(before['srp'])} → ${priceText(after['srp'])}`,
        actor: await actor(),
      });
    }
    if ((before['isActive'] ?? true) !== (after['isActive'] ?? true)) {
      entries.push({
        ...base,
        category: 'product',
        action: after['isActive'] === false ? 'product.hidden' : 'product.shown',
        summary:
          after['isActive'] === false
            ? `Hid ${name} from the store`
            : `Put ${name} back in the store`,
        actor: await actor(),
      });
    }
    const edited = changedFields(before, after, QUIET_PRODUCT_FIELDS);
    if (edited.length) {
      entries.push({
        ...base,
        category: 'product',
        action: 'product.edited',
        summary: `Edited ${name} (${edited.join(', ')})`,
        actor: await actor(),
      });
    }
    return entries;
  },
);

// ── Services ─────────────────────────────────────────────────────────────────

export const logServiceActivity = watch(
  'services/{serviceId}',
  async (before, after, id, actor) => {
    if (!after) return [];
    const title = String(after['title'] ?? id);
    const base = { targetType: 'service' as const, targetId: id, targetLabel: title };
    if (!before) {
      return [
        {
          ...base,
          category: 'service',
          action: 'service.added',
          summary: `Added service ${title}`,
          actor: await actor(),
        },
      ];
    }
    const entries: ActivityInput[] = [];
    if ((before['isActive'] ?? true) !== (after['isActive'] ?? true)) {
      entries.push({
        ...base,
        category: 'service',
        action: after['isActive'] === false ? 'service.deactivated' : 'service.activated',
        summary:
          after['isActive'] === false
            ? `Deactivated service ${title}`
            : `Reactivated service ${title}`,
        actor: await actor(),
      });
    }
    const edited = changedFields(before, after, new Set(['isActive', 'updatedAt', 'createdAt']));
    if (edited.length) {
      entries.push({
        ...base,
        category: 'service',
        action: 'service.edited',
        summary: `Edited service ${title} (${edited.join(', ')})`,
        actor: await actor(),
      });
    }
    return entries;
  },
);

// ── Payment receivers ────────────────────────────────────────────────────────

function receiverText(receiver: DocumentData): string {
  const where = receiver['type'] === 'bank' ? String(receiver['bankName'] || 'Bank') : 'GCash';
  return `${where} ${receiver['accountNumber'] ?? ''} (${receiver['accountName'] ?? ''})`;
}

/** The accounts customers send transfers to. Every change is logged, account numbers included, for audit. */
export const logReceiverActivity = watch(
  'paymentReceivers/{receiverId}',
  async (before, after, id, actor) => {
    const current = after ?? before;
    if (!current) return [];
    const name = String(current['label'] || receiverText(current));
    const base = { targetType: 'receiver' as const, targetId: id, targetLabel: name };
    if (!before && after) {
      return [
        {
          ...base,
          category: 'payment',
          action: 'receiver.added',
          summary: `Added payment account ${receiverText(after)}`,
          actor: await actor(),
        },
      ];
    }
    if (before && !after) {
      return [
        {
          ...base,
          category: 'payment',
          action: 'receiver.deleted',
          summary: `Deleted payment account ${receiverText(before)}`,
          actor: await actor(),
        },
      ];
    }
    if (!before || !after) return [];
    const entries: ActivityInput[] = [];
    if ((before['isActive'] ?? true) !== (after['isActive'] ?? true)) {
      entries.push({
        ...base,
        category: 'payment',
        action: after['isActive'] === false ? 'receiver.deactivated' : 'receiver.activated',
        summary: `${after['isActive'] === false ? 'Stopped' : 'Started'} taking payments to ${receiverText(after)}`,
        actor: await actor(),
      });
    }
    const edited = changedFields(before, after, new Set(['isActive', 'updatedAt', 'createdAt']));
    if (edited.length) {
      const account = edited.some((key) =>
        ['accountNumber', 'accountName', 'bankName', 'type'].includes(key),
      );
      entries.push({
        ...base,
        category: 'payment',
        action: 'receiver.edited',
        summary: account
          ? `Changed payment account ${receiverText(before)} → ${receiverText(after)}`
          : `Edited payment account ${receiverText(after)} (${edited.join(', ')})`,
        actor: await actor(),
      });
    }
    return entries;
  },
);

// ── Accounts ─────────────────────────────────────────────────────────────────

/**
 * Sign-ups, accounts created by admins, and role changes. Only changes made from the app are logged here: the admin
 * account functions log their own (a removed account's profile is deleted and may be put back by the function).
 */
export const logUserActivity = onDocumentWrittenWithAuthContext(
  'users/{uid}',
  async (event: WriteEvent) => {
    const by = appUserOf(event);
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const uid = event.params['uid'];
    if (!by || !after) return;
    const name = String(after['name'] || after['email'] || uid);
    const base = { targetType: 'user' as const, targetId: uid, targetLabel: name };
    const actor = await actorLookup()(by);
    const entries: ActivityInput[] = [];
    if (!before) {
      entries.push(
        by === uid
          ? {
              ...base,
              category: 'account',
              action: 'account.registered',
              summary: `Signed up (${after['email'] ?? ''})`,
              actor,
            }
          : {
              ...base,
              category: 'account',
              action: 'account.created',
              summary: `Created a ${after['role']} account for ${name} (${after['email'] ?? ''})`,
              actor,
            },
      );
    } else if (before['role'] !== after['role']) {
      entries.push({
        ...base,
        category: 'account',
        action: 'account.role',
        summary: `Changed ${name}'s role: ${before['role']} → ${after['role']}`,
        actor,
      });
    }
    try {
      await writeEntries(event, entries);
    } catch (err) {
      logger.error('Activity logging failed', { document: event.document, err });
    }
  },
);

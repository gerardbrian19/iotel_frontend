/** What an activity log entry is about. Mirrors `ActivityCategory` in functions/src/activity.ts. */
export type ActivityCategory =
  | 'order'
  | 'payment'
  | 'booking'
  | 'inventory'
  | 'product'
  | 'service'
  | 'account';

export const ACTIVITY_CATEGORIES: readonly { value: ActivityCategory; label: string }[] = [
  { value: 'order', label: 'Orders' },
  { value: 'payment', label: 'Payments' },
  { value: 'booking', label: 'Bookings' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'product', label: 'Products' },
  { value: 'service', label: 'Services' },
  { value: 'account', label: 'Accounts' },
];

/** `system` for automatic changes (PayMongo's webhook, unpaid-order expiry, restocks after a refund). */
export type ActivityActorRole = 'customer' | 'staff' | 'admin' | 'system';

/**
 * One `activityLog/{id}` document: who did what and when. Written by the Cloud Functions (functions/src/activity.ts),
 * except sign-ins, which each session records itself. Read by admins only; never edited.
 */
export interface ActivityEntry {
  id: string;
  /** ISO time of the change. */
  at: string;
  category: ActivityCategory;
  /** Machine-readable kind, e.g. `order.shipped`. */
  action: string;
  /** One readable sentence, e.g. "Shipped ORD-0007 via LBC". */
  summary: string;
  /** Null for automatic changes. */
  actorId: string | null;
  actorName: string;
  actorRole: ActivityActorRole;
  targetType: 'order' | 'booking' | 'product' | 'service' | 'user' | 'receiver';
  targetId: string;
  targetLabel: string;
  /** Pesos, on order and payment entries. */
  amount?: number;
}

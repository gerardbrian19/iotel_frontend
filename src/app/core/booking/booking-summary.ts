import { ACTIVE_BOOKING_STATUSES, Booking } from '../models';
import { toDateKey } from './schedule';

export interface BookingStatusCount {
  label: string;
  /** ng-zorro tag colour, matching the booking panel's status tags. */
  color: string;
  count: number;
}

export interface BookingSummary {
  total: number;
  /** In the order a booking moves through them. */
  byStatus: BookingStatusCount[];
  /** New requests to quote, plus cancelled bookings whose payment must be refunded. */
  needsAction: number;
  /** Bookings still holding a slot today. */
  today: number;
  /** The next few bookings still holding a slot, from today on, soonest first. */
  upcoming: Booking[];
  /** Money received for bookings that hasn't been refunded. */
  revenue: number;
}

const bySlot = (a: Booking, b: Booking) =>
  (a.preferredDate + a.preferredTime).localeCompare(b.preferredDate + b.preferredTime);

/** Booking figures for the admin dashboard. Status names follow the booking panel (Requested → Booked · Paid). */
export function bookingSummary(
  bookings: readonly Booking[],
  now = new Date(),
  upcomingCount = 5,
): BookingSummary {
  const today = toDateKey(now);
  const count = (test: (b: Booking) => boolean) => bookings.filter(test).length;
  const active = bookings.filter((b) => ACTIVE_BOOKING_STATUSES.includes(b.status));
  return {
    total: bookings.length,
    byStatus: [
      { label: 'Requested', color: 'warning', count: count((b) => b.status === 'Pending') },
      {
        label: 'Awaiting payment',
        color: 'processing',
        count: count((b) => b.status === 'Confirmed' && b.payment?.status !== 'Paid'),
      },
      { label: 'Booked · Paid', color: 'success', count: count((b) => b.status === 'Paid') },
      { label: 'Completed', color: 'success', count: count((b) => b.status === 'Completed') },
      { label: 'Cancelled', color: 'error', count: count((b) => b.status === 'Cancelled') },
    ],
    needsAction: count(
      (b) => b.status === 'Pending' || (b.status === 'Cancelled' && b.payment?.status === 'Paid'),
    ),
    today: active.filter((b) => b.preferredDate === today).length,
    upcoming: active
      .filter((b) => b.preferredDate >= today)
      .sort(bySlot)
      .slice(0, upcomingCount),
    revenue: bookings
      .filter((b) => b.payment?.status === 'Paid')
      .reduce((sum, b) => sum + (b.payment?.amount ?? 0), 0),
  };
}

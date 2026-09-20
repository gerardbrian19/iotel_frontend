/**
 * When services can be booked. Bookings hold one slot each and every slot takes one booking at a time
 * (one service team), so the slot's document id is what makes double-booking impossible (see firestore.rules).
 */

/** Slot start times, `HH:mm` (12:00-13:00 is lunch). */
export const BOOKING_SLOTS: readonly string[] = [
  '09:00',
  '10:00',
  '11:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
];

/** Earliest bookable day is this many days from today. */
export const BOOKING_LEAD_DAYS = 1;

/** Latest bookable day is this many days from today. */
export const BOOKING_HORIZON_DAYS = 60;

/** Sunday (0) is closed. */
const CLOSED_WEEKDAYS: readonly number[] = [0];

/** `YYYY-MM-DD` in the viewer's local time zone (never `toISOString`, which shifts the date across midnight). */
export function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Local midnight of a `YYYY-MM-DD` key. */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

export function firstBookableDate(now = new Date()): Date {
  return addDays(now, BOOKING_LEAD_DAYS);
}

export function lastBookableDate(now = new Date()): Date {
  return addDays(now, BOOKING_HORIZON_DAYS);
}

/** Document id of a slot in `bookingSlots`. */
export function slotId(date: string, time: string): string {
  return `${date}T${time}`;
}

/** True when the shop is open on that day and it falls inside the booking window (ignores existing bookings). */
export function isOpenDate(date: Date, now = new Date()): boolean {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return (
    !CLOSED_WEEKDAYS.includes(day.getDay()) &&
    day >= firstBookableDate(now) &&
    day <= lastBookableDate(now)
  );
}

/** True when every slot of that day is already taken. `taken` holds slot ids. */
export function isFullyBooked(date: string, taken: ReadonlySet<string>): boolean {
  return BOOKING_SLOTS.every((time) => taken.has(slotId(date, time)));
}

/** `10:00` → `10:00 AM`, `13:00` → `1:00 PM`. */
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** `Fri, Sep 25, 2026 at 10:00 AM`, for messages and labels. */
export function formatSlot(date: string, time: string): string {
  const day = fromDateKey(date).toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${day} at ${formatTime(time)}`;
}

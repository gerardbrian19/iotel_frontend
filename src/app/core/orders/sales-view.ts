import { Order } from '../models';

/** How the sales chart groups orders. */
export type SalesPeriod = 'day' | 'week' | 'month';

export const SALES_PERIODS: readonly { value: SalesPeriod; label: string; span: string }[] = [
  { value: 'day', label: 'Daily', span: 'the last 30 days' },
  { value: 'week', label: 'Weekly', span: 'the last 12 weeks' },
  { value: 'month', label: 'Monthly', span: 'the last 12 months' },
];

/** Buckets per period, ending with the one that contains today. */
const BUCKETS: Record<SalesPeriod, number> = { day: 30, week: 12, month: 12 };

export interface SalesBucket {
  /** `YYYY-MM-DD` (day, or the Monday that starts a week) or `YYYY-MM` (month). */
  key: string;
  /** Short axis label, e.g. `Sep` or `Oct 13`. */
  label: string;
  /** Long name for tooltips, e.g. `September 2026` or `Week of Oct 13 – 19, 2026`. */
  title: string;
  /** Sum of `total` over the delivered orders in the bucket, in PHP. */
  total: number;
  orders: number;
  /** Whether the axis shows this bucket's label on wide / narrow screens. */
  tick: boolean;
  mobileTick: boolean;
}

export interface SalesAxis {
  /** Value at the top of the plot; always >= the largest bar. */
  top: number;
  /** Evenly spaced from 0 to `top`. */
  ticks: number[];
}

const SHORT_MONTH = new Intl.DateTimeFormat('en-PH', { month: 'short' });
const LONG_MONTH = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' });
const SHORT_DAY = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' });
const LONG_DAY = new Intl.DateTimeFormat('en-PH', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const STEPS = [1, 2, 2.5, 5, 10];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** Local midnight of the Monday on or before `date`. */
function weekStart(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

/** The bucket a moment falls in. */
function keyOf(period: SalesPeriod, date: Date): string {
  if (period === 'day') return dayKey(date);
  if (period === 'week') return dayKey(weekStart(date));
  return monthKey(date);
}

/** Start of the bucket `back` buckets before the one that contains `now`. */
function bucketStart(period: SalesPeriod, now: Date, back: number): Date {
  if (period === 'day') return new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
  if (period === 'week') {
    const start = weekStart(now);
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() - back * 7);
  }
  return new Date(now.getFullYear(), now.getMonth() - back, 1);
}

function names(period: SalesPeriod, start: Date): { label: string; title: string } {
  if (period === 'day') return { label: SHORT_DAY.format(start), title: LONG_DAY.format(start) };
  if (period === 'week') {
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    const endText =
      end.getMonth() === start.getMonth() ? String(end.getDate()) : SHORT_DAY.format(end);
    return {
      label: SHORT_DAY.format(start),
      title: `Week of ${SHORT_DAY.format(start)} – ${endText}, ${end.getFullYear()}`,
    };
  }
  return { label: SHORT_MONTH.format(start), title: LONG_MONTH.format(start) };
}

/**
 * Sales per day (last 30 days), week (last 12 weeks, Monday to Sunday) or month (last 12 months), oldest first, each
 * series ending with the bucket that contains `now`. Same definition as the dashboard's revenue figure: delivered
 * orders only, counted when they were delivered (their creation time if the delivery time is missing).
 */
export function salesSeries(
  orders: readonly Order[],
  period: SalesPeriod,
  now = new Date(),
): SalesBucket[] {
  const count = BUCKETS[period];
  // Label every bar when there are few of them; every 5th / 10th day otherwise. Always label the latest one.
  const every = period === 'day' ? 5 : 1;
  const everyMobile = period === 'day' ? 10 : 2;
  const series: SalesBucket[] = [];
  const byKey = new Map<string, SalesBucket>();
  for (let back = count - 1; back >= 0; back--) {
    const start = bucketStart(period, now, back);
    const entry: SalesBucket = {
      key: keyOf(period, start),
      ...names(period, start),
      total: 0,
      orders: 0,
      tick: back % every === 0,
      mobileTick: back % everyMobile === 0,
    };
    series.push(entry);
    byKey.set(entry.key, entry);
  }
  for (const order of orders) {
    if (order.status !== 'Delivered') continue;
    const entry = byKey.get(keyOf(period, new Date(order.deliveredAt || order.createdAt)));
    if (!entry) continue;
    entry.total += order.total;
    entry.orders++;
  }
  return series;
}

/** A y-axis with round tick values (1, 2, 2.5, 5 × a power of ten) that fits `max`. */
export function salesAxis(max: number, intervals = 4): SalesAxis {
  const raw = Math.max(max, 1000) / intervals;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = (STEPS.find((s) => s * magnitude >= raw) ?? 10) * magnitude;
  return {
    top: step * intervals,
    ticks: Array.from({ length: intervals + 1 }, (_, i) => step * i),
  };
}

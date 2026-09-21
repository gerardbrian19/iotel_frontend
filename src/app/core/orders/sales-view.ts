import { Order } from '../models';

export interface MonthlySales {
  /** `YYYY-MM`. */
  key: string;
  /** Short month name for the axis, e.g. `Sep`. */
  label: string;
  /** Long name for tooltips, e.g. `September 2026`. */
  title: string;
  /** Sum of `total` over the delivered orders of the month, in PHP. */
  total: number;
  orders: number;
}

export interface SalesAxis {
  /** Value at the top of the plot; always >= the largest bar. */
  top: number;
  /** Evenly spaced from 0 to `top`. */
  ticks: number[];
}

const SHORT_MONTH = new Intl.DateTimeFormat('en-PH', { month: 'short' });
const LONG_MONTH = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' });
const STEPS = [1, 2, 2.5, 5, 10];

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Sales per calendar month for the `months` months ending with the one that contains `now`, oldest first.
 * Same definition as the dashboard's revenue figure: delivered orders only, counted in the month they were
 * delivered (their creation month if the delivery time is missing).
 */
export function monthlySales(
  orders: readonly Order[],
  months = 12,
  now = new Date(),
): MonthlySales[] {
  const series: MonthlySales[] = [];
  const byKey = new Map<string, MonthlySales>();
  for (let back = months - 1; back >= 0; back--) {
    const month = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const entry = {
      key: monthKey(month),
      label: SHORT_MONTH.format(month),
      title: LONG_MONTH.format(month),
      total: 0,
      orders: 0,
    };
    series.push(entry);
    byKey.set(entry.key, entry);
  }
  for (const order of orders) {
    if (order.status !== 'Delivered') continue;
    const entry = byKey.get(monthKey(new Date(order.deliveredAt || order.createdAt)));
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

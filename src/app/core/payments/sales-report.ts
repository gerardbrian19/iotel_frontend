import { Booking, Order, Payment } from '../models';
import { paymentMethodLabel } from './payment-methods';
import { MoneyCount, RevenueChannel, revenueChannel } from './payment-summary';

/**
 * The admin dashboard's downloadable sales & revenue report. One set of rules feeds both the totals on the card and
 * the CSV, so they always agree:
 *
 * - **Counted:** orders and service bookings whose payment is `Paid` (PayMongo confirmed it, staff verified the
 *   transfer, or staff recorded it on site) and that aren't cancelled. Unpaid, rejected (still unpaid), refunded and
 *   cancelled ones are left out. Each document is counted once.
 * - **Date:** when the payment was confirmed (`payment.paidAt`), or when the order / booking was created for older
 *   records without one. Local time, start inclusive, end exclusive.
 * - **Channel:** from the recorded method (`revenueChannel`): `gcash` → GCash; `bank:<Bank>`, `bank` and online
 *   banking → Bank transfer; anything else (card, Maya, cash, …) is "other" and stays out of the combined total.
 */

export type ReportPeriod = 'day' | 'week' | 'month';
export type ReportMethodFilter = 'all' | 'gcash' | 'bank';

export const REPORT_PERIODS: readonly { value: ReportPeriod; label: string }[] = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
];

export const REPORT_METHOD_FILTERS: readonly { value: ReportMethodFilter; label: string }[] = [
  { value: 'all', label: 'All payment methods' },
  { value: 'gcash', label: 'GCash only' },
  { value: 'bank', label: 'Bank transfer only' },
];

export interface ReportRange {
  period: ReportPeriod;
  /** Inclusive, local midnight. */
  start: Date;
  /** Exclusive, local midnight after the last day. */
  end: Date;
  /** `YYYY-MM-DD` of the first and last day. */
  startKey: string;
  endKey: string;
  /** e.g. `Oct 27, 2026`, `Oct 26 – Nov 1, 2026`, `October 2026`. */
  label: string;
}

export interface ReportRow {
  kind: 'Order' | 'Service booking';
  /** `ORD-0048`, or the booked service and slot. */
  reference: string;
  /** When the order / booking was made (ISO). */
  orderDate: string;
  /** When the payment was confirmed (ISO); the order date for older records. */
  paidDate: string;
  customerName: string;
  channel: RevenueChannel;
  /** e.g. `GCash`, `BPI transfer`, `Card`. */
  method: string;
  /** e.g. `Paid (verified transfer)`. */
  status: string;
  /** The order total / booking quote. */
  total: number;
  /** What was actually paid; the figure the revenue totals add up. */
  amount: number;
}

export interface SalesReport {
  range: ReportRange;
  filter: ReportMethodFilter;
  /** Newest payment first. */
  rows: ReportRow[];
  gcash: MoneyCount;
  bank: MoneyCount;
  /** GCash + bank transfer. */
  combined: MoneyCount;
  /** Card, Maya, cash, …: listed under "All payment methods" but not in `combined`. */
  other: MoneyCount;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shortDate(d: Date, withYear = true): string {
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

/** The day, Monday–Sunday week or calendar month that contains `anchor`. */
export function reportRange(period: ReportPeriod, anchor: Date): ReportRange {
  const day = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  let start: Date;
  let end: Date;
  let label: string;
  switch (period) {
    case 'day':
      start = day;
      end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
      label = shortDate(start);
      break;
    case 'week': {
      const sinceMonday = (day.getDay() + 6) % 7;
      start = new Date(day.getFullYear(), day.getMonth(), day.getDate() - sinceMonday);
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
      label = `${shortDate(start, start.getFullYear() !== last.getFullYear())} – ${shortDate(last)}`;
      break;
    }
    case 'month':
      start = new Date(day.getFullYear(), day.getMonth(), 1);
      end = new Date(day.getFullYear(), day.getMonth() + 1, 1);
      label = `${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
      break;
  }
  const lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
  return { period, start, end, startKey: dateKey(start), endKey: dateKey(lastDay), label };
}

const PAID_VIA: Record<string, string> = {
  paymongo: 'Paid (PayMongo)',
  manual: 'Paid (verified transfer)',
  onsite: 'Paid (on site)',
};

const zero = (): MoneyCount => ({ amount: 0, count: 0 });

function add(target: MoneyCount, amount: number): void {
  target.amount += amount;
  target.count++;
}

/** The payment counts as revenue: confirmed, not refunded, on an order / booking that wasn't cancelled. */
function collected(payment: Payment | undefined, cancelled: boolean): payment is Payment {
  return !!payment && payment.status === 'Paid' && !cancelled;
}

export function salesReport(
  orders: readonly Order[],
  bookings: readonly Booking[],
  period: ReportPeriod,
  anchor: Date,
  filter: ReportMethodFilter,
): SalesReport {
  const range = reportRange(period, anchor);
  const from = range.start.getTime();
  const to = range.end.getTime();
  const seen = new Set<string>();
  const rows: ReportRow[] = [];

  const consider = (
    key: string,
    payment: Payment | undefined,
    cancelled: boolean,
    createdAt: string | undefined,
    row: Pick<ReportRow, 'kind' | 'reference' | 'customerName' | 'total'>,
  ) => {
    if (seen.has(key) || !collected(payment, cancelled)) return;
    const paidDate = payment.paidAt || createdAt || '';
    const when = Date.parse(paidDate);
    if (!Number.isFinite(when) || when < from || when >= to) return;
    const channel = revenueChannel(payment.method);
    if (filter !== 'all' && channel !== filter) return;
    seen.add(key);
    rows.push({
      ...row,
      orderDate: createdAt ?? '',
      paidDate,
      channel,
      method: paymentMethodLabel(payment.method) || 'Not recorded',
      status: PAID_VIA[payment.provider] ?? 'Paid',
      amount: payment.amount > 0 ? payment.amount : row.total,
    });
  };

  for (const order of orders) {
    consider(`order:${order.id}`, order.payment, order.status === 'Cancelled', order.createdAt, {
      kind: 'Order',
      reference: order.code,
      customerName: order.customerName,
      total: order.total,
    });
  }
  for (const booking of bookings) {
    consider(
      `booking:${booking.id}`,
      booking.payment,
      booking.status === 'Cancelled',
      booking.createdAt,
      {
        kind: 'Service booking',
        reference: `${booking.serviceName}, ${booking.preferredDate} ${booking.preferredTime}`,
        customerName: booking.customerName,
        total: booking.quote?.amount ?? booking.payment?.amount ?? 0,
      },
    );
  }
  rows.sort((a, b) => b.paidDate.localeCompare(a.paidDate));

  const gcash = zero();
  const bank = zero();
  const other = zero();
  for (const row of rows) {
    add(row.channel === 'gcash' ? gcash : row.channel === 'bank' ? bank : other, row.amount);
  }
  const combined = { amount: gcash.amount + bank.amount, count: gcash.count + bank.count };
  return { range, filter, rows, gcash, bank, combined, other };
}

// ── Exports (CSV, Excel, print) ──────────────────────────────────────────────
// All three are built from the same `SalesReport`, with the same header, summary and columns.

const PERIOD_TITLE: Record<ReportPeriod, string> = {
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
};

export function reportTitle(report: SalesReport): string {
  return `IOTEL ${PERIOD_TITLE[report.range.period]} Sales Report`;
}

function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dateKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The lines under the title: period, dates, filter, what is counted, when it was made. */
export function reportDetails(report: SalesReport, generatedAt: Date): [string, string][] {
  const { range } = report;
  return [
    ['Reporting period', `${PERIOD_TITLE[range.period]} (${range.label})`],
    ['Start date', range.startKey],
    ['End date', range.endKey],
    [
      'Payment method filter',
      REPORT_METHOD_FILTERS.find((f) => f.value === report.filter)?.label ?? 'All payment methods',
    ],
    [
      'Counted',
      'Paid orders and service bookings, by payment date; excludes unpaid, refunded and cancelled',
    ],
    ['Generated', stamp(generatedAt.toISOString())],
  ];
}

export interface SummaryLine {
  label: string;
  amount: number;
  count: number;
  /** The combined total, shown as the totals line. */
  total?: boolean;
}

/** GCash, bank transfer, combined, and (for "All payment methods") the other methods. */
export function reportSummary(report: SalesReport): SummaryLine[] {
  const lines: SummaryLine[] = [
    { label: 'GCash revenue', ...report.gcash },
    { label: 'Bank Transfer revenue', ...report.bank },
    { label: 'Combined revenue (GCash + Bank Transfer)', ...report.combined, total: true },
  ];
  if (report.filter === 'all') {
    lines.push({ label: 'Other methods (not in combined)', ...report.other });
  }
  return lines;
}

export const REPORT_COLUMNS = [
  'Type',
  'Order ID / reference',
  'Order date',
  'Payment date',
  'Customer',
  'Payment method',
  'Payment status',
  'Order total (PHP)',
  'Amount paid (PHP)',
] as const;

/** `IOTEL_Daily_Sales_Report_2026-10-27.csv`, `…_Weekly_…_2026-10-26_to_2026-11-01.xlsx`, `…_Monthly_…_2026-10.csv`. */
export function reportFilename(report: SalesReport, extension: 'csv' | 'xlsx' = 'csv'): string {
  const { period, startKey, endKey } = report.range;
  const when =
    period === 'day'
      ? startKey
      : period === 'week'
        ? `${startKey}_to_${endKey}`
        : startKey.slice(0, 7);
  const method =
    report.filter === 'all' ? '' : report.filter === 'gcash' ? '_GCash' : '_Bank_Transfer';
  return `IOTEL_${PERIOD_TITLE[period]}_Sales_Report${method}_${when}.${extension}`;
}

// CSV

/** Quotes a cell, and defuses text a spreadsheet would run as a formula (`=`, `+`, `-`, `@` at the start). */
function csvCell(value: string | number): string {
  if (typeof value === 'number') return value.toFixed(2);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * The report as CSV (RFC 4180: comma-separated, CRLF lines, quoted where needed), UTF-8 with a BOM so Excel reads
 * names with ñ and other accents correctly. Amounts are plain PHP numbers. Header block, then the transactions table
 * (one field per column), then a Summary block.
 */
export function reportCsv(report: SalesReport, generatedAt = new Date()): string {
  const lines: (string | number)[][] = [
    [reportTitle(report)],
    ...reportDetails(report, generatedAt),
    [],
    [...REPORT_COLUMNS],
    ...report.rows.map((r) => [
      r.kind,
      r.reference,
      stamp(r.orderDate),
      stamp(r.paidDate),
      r.customerName,
      r.method,
      r.status,
      r.total,
      r.amount,
    ]),
    [],
    ['Summary', 'Amount (PHP)', 'Payments'],
    ...reportSummary(report).map((line) => [line.label, line.amount, String(line.count)]),
    ['Transactions', '', String(report.rows.length)],
  ];
  return '﻿' + lines.map((line) => line.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

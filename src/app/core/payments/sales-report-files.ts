import { XLSX_STYLE, XlsxRow, buildXlsx } from '../../shared/utils/xlsx-writer';
import {
  REPORT_COLUMNS,
  SalesReport,
  reportDetails,
  reportSummary,
  reportTitle,
} from './sales-report';

/**
 * The sales report as an Excel workbook and as a printable page, from the same `SalesReport` (and the same header,
 * summary and columns) as the CSV in sales-report.ts.
 */

function date(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Two sheets: **Summary** (title, period, filter, then GCash / Bank Transfer / combined / other with payment counts)
 * and **Transactions** (one row per payment, real dates and PHP amounts, bold frozen header with filters, a totals
 * row). Returns the .xlsx bytes.
 */
export function reportWorkbook(report: SalesReport, generatedAt = new Date()): Uint8Array<ArrayBuffer> {
  const summary: XlsxRow[] = [
    [{ value: reportTitle(report), style: XLSX_STYLE.title }],
    [],
    ...reportDetails(report, generatedAt).map(
      ([label, value]): XlsxRow => [{ value: label, style: XLSX_STYLE.bold }, value],
    ),
    [],
    ['Revenue', 'Amount (PHP)', 'Payments'].map((value) => ({ value, style: XLSX_STYLE.header })),
    ...reportSummary(report).map(
      (line): XlsxRow =>
        line.total
          ? [
              { value: line.label, style: XLSX_STYLE.totalLabel },
              { value: line.amount, style: XLSX_STYLE.totalCurrency },
              { value: line.count, style: XLSX_STYLE.totalNumber },
            ]
          : [line.label, { value: line.amount, style: XLSX_STYLE.currency }, line.count],
    ),
    [],
    [{ value: 'Transactions', style: XLSX_STYLE.bold }, null, report.rows.length],
    [],
    [
      {
        value: 'Every payment is listed on the Transactions sheet.',
        style: XLSX_STYLE.muted,
      },
    ],
  ];

  const paidTotal = report.rows.reduce((sum, r) => sum + r.amount, 0);
  const transactions: XlsxRow[] = [
    REPORT_COLUMNS.map((value) => ({ value, style: XLSX_STYLE.header })),
    ...report.rows.map(
      (r): XlsxRow => [
        r.kind,
        r.reference,
        date(r.orderDate),
        date(r.paidDate),
        r.customerName,
        r.method,
        r.status,
        { value: r.total, style: XLSX_STYLE.currency },
        { value: r.amount, style: XLSX_STYLE.currency },
      ],
    ),
  ];
  if (report.rows.length) {
    transactions.push(
      [],
      [
        { value: `Total (${report.rows.length} payments)`, style: XLSX_STYLE.totalLabel },
        ...Array.from({ length: 7 }, () => ({ value: null, style: XLSX_STYLE.totalLabel })),
        { value: paidTotal, style: XLSX_STYLE.totalCurrency },
      ],
    );
  }

  return buildXlsx(
    [
      { name: 'Summary', rows: summary, widths: [44, 22, 12] },
      {
        name: 'Transactions',
        rows: transactions,
        widths: [16, 32, 17, 17, 26, 20, 24, 17, 17],
        freezeHeader: true,
        autoFilterRow: report.rows.length ? 1 : undefined,
      },
    ],
    generatedAt,
  );
}

// ── Printable page ───────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const peso = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function when(iso: string): string {
  const d = date(iso);
  return d
    ? d.toLocaleString('en-PH', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';
}

/**
 * A self-contained HTML page of the report, laid out for A4 landscape, that opens the browser's print dialog
 * (where "Save as PDF" makes the PDF). Every value from the data is HTML-escaped; the page loads nothing external.
 */
export function reportPrintHtml(report: SalesReport, generatedAt = new Date()): string {
  const details = reportDetails(report, generatedAt)
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');
  const summary = reportSummary(report)
    .map(
      (line) =>
        `<tr${line.total ? ' class="total"' : ''}><td>${escapeHtml(line.label)}</td><td class="num">${peso(
          line.amount,
        )}</td><td class="num">${line.count}</td></tr>`,
    )
    .join('');
  const rows = report.rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.kind)}</td><td>${escapeHtml(r.reference)}</td><td>${escapeHtml(
          when(r.orderDate),
        )}</td><td>${escapeHtml(when(r.paidDate))}</td><td>${escapeHtml(r.customerName)}</td><td>${escapeHtml(
          r.method,
        )}</td><td>${escapeHtml(r.status)}</td><td class="num">${peso(r.total)}</td><td class="num">${peso(
          r.amount,
        )}</td></tr>`,
    )
    .join('');
  const title = escapeHtml(reportTitle(report));

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 24px; font: 12px/1.4 Arial, Helvetica, sans-serif; color: #1A1A1A; background: #FFFFFF; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #CC2020; padding-bottom: 8px; margin-bottom: 16px; }
  .brand { font-size: 22px; font-weight: 900; letter-spacing: 4px; }
  .brand small { display: block; font-size: 9px; letter-spacing: 3px; color: #C9A84C; }
  h1 { margin: 0; font-size: 18px; }
  h2 { margin: 20px 0 8px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; }
  .details { width: auto; margin-bottom: 8px; }
  .details th { text-align: left; padding: 2px 16px 2px 0; color: #595959; font-weight: 600; }
  .summary { width: 60%; }
  .summary td, .tx td, .tx th { padding: 6px 8px; border-bottom: 1px solid #E8E8E8; }
  .tx th { text-align: left; background: #F5F5F5; font-weight: 700; border-bottom: 1px solid #BFBFBF; }
  .tx tr { break-inside: avoid; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .total td { font-weight: 700; background: #FFF8E6; border-top: 2px solid #1A1A1A; }
  .empty { color: #8C8C8C; }
  .actions { margin-bottom: 16px; }
  .actions button { padding: 8px 16px; border: 0; border-radius: 6px; background: #CC2020; color: #FFFFFF; font-weight: 700; cursor: pointer; }
  @media print { body { margin: 0; } .actions { display: none; } thead { display: table-header-group; } }
</style></head>
<body>
  <div class="actions"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>
  <header>
    <div class="brand">IOTEL<small>BY GOLDCOMM</small></div>
    <h1>${title}</h1>
  </header>
  <table class="details">${details}</table>
  <h2>Summary</h2>
  <table class="summary">
    <thead><tr><th style="text-align:left">Revenue</th><th class="num">Amount</th><th class="num">Payments</th></tr></thead>
    <tbody>${summary}<tr><td>Transactions</td><td></td><td class="num">${report.rows.length}</td></tr></tbody>
  </table>
  <h2>Transactions</h2>
  ${
    report.rows.length
      ? `<table class="tx"><thead><tr>${REPORT_COLUMNS.map(
          (c, i) => `<th${i >= 7 ? ' class="num"' : ''}>${escapeHtml(c)}</th>`,
        ).join('')}</tr></thead><tbody>${rows}</tbody></table>`
      : '<p class="empty">No paid orders or bookings in this period for this payment method.</p>'
  }
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 300); });</script>
</body></html>`;
}

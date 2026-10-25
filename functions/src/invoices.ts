/**
 * Invoices emailed to the customer once an order or booking is paid: a branded HTML email with the same invoice as a
 * PDF attached.
 *
 * - `onOrderPaid` / `onBookingPaid`: send it automatically when PayMongo's webhook marks the payment Paid.
 * - `sendInvoiceEmail`: staff send (or resend) it by hand. Transfers and on-site payments are never sent
 *   automatically; staff send them from the approve / record-payment dialogs (`sendInvoice` there) or with this.
 *
 * Each order or booking gets one invoice number (`INV-000123`, from `counters/invoices`), kept on resends. What was sent
 * is recorded on the document as `invoice` (backend-only, see firestore.rules).
 *
 * Until Goldcomm confirms its BIR registration this is a payment acknowledgement, not an official receipt: a BIR
 * invoice needs the seller's TIN, registered address and an approved serial range (INVOICE_SELLER_* in functions/.env).
 */
import { getAuth } from 'firebase-admin/auth';
import { DocumentData, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineString } from 'firebase-functions/params';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import PDFDocument from 'pdfkit';
import { Actor, logActivity, orderCode } from './activity.js';
import { db } from './app.js';
import { MAIL_SECRETS, sendMail } from './mail.js';
import {
  Kind,
  collectionOf,
  docId,
  kindOf,
  methodLabel,
  peso,
  requireStaff,
} from './payment-common.js';

const SELLER_NAME = defineString('INVOICE_SELLER_NAME', { default: 'Goldcomm Corporation' });
const SELLER_ADDRESS = defineString('INVOICE_SELLER_ADDRESS', { default: '' });
const SELLER_TIN = defineString('INVOICE_SELLER_TIN', { default: '' });

/** Staff can't send the same invoice again sooner than this. */
const RESEND_COOLDOWN_MS = 60 * 1000;
const TIME_ZONE = 'Asia/Manila';
const SYSTEM: Actor = { id: null, name: 'System', role: 'system' };

interface InvoiceLine {
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

interface InvoiceData {
  number: string;
  issuedAt: Date;
  /** `ORD-0007`, or the booked service and slot. */
  reference: string;
  customerName: string;
  /** Delivery address lines (orders only). */
  address: string[];
  lines: InvoiceLine[];
  subtotal: number;
  shippingFee: number;
  total: number;
  method: string;
  paymentReference: string;
  paidAt: Date | null;
}

/** What was sent, as stored on the order or booking (`invoice`). Mirrors `InvoiceInfo` in the app. */
interface InvoiceRecord {
  number: string;
  sentAt?: Timestamp;
  sentTo?: string;
  sentBy?: string | null;
  sentByName?: string;
  sendCount?: number;
  attemptAt?: Timestamp;
}

// ── Content ──────────────────────────────────────────────────────────────────

function dateOf(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

function longDate(date: Date): string {
  return date.toLocaleDateString('en-PH', { timeZone: TIME_ZONE, dateStyle: 'long' });
}

function dateTime(date: Date): string {
  return date.toLocaleString('en-PH', {
    timeZone: TIME_ZONE,
    dateStyle: 'long',
    timeStyle: 'short',
  });
}

/** The PDF's built-in fonts have no ₱ sign, so the PDF writes amounts as `PHP 1,234.00`. */
function php(value: number): string {
  return `PHP ${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function capitalized(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function slotLabel(date: unknown, time: unknown): string {
  const day = new Date(`${date}T${time ?? '00:00'}:00+08:00`);
  return Number.isNaN(day.getTime()) ? `${date} ${time}` : dateTime(day);
}

function buildInvoice(kind: Kind, doc: DocumentData, number: string): InvoiceData {
  const payment = (doc['payment'] as DocumentData | undefined) ?? {};
  const common = {
    number,
    issuedAt: new Date(),
    customerName: String(doc['customerName'] ?? ''),
    method: capitalized(methodLabel(payment['method'])),
    paymentReference: String(payment['paymentId'] ?? ''),
    paidAt: dateOf(payment['paidAt']),
  };
  if (kind === 'order') {
    const items = (doc['items'] as DocumentData[] | undefined) ?? [];
    const address = (doc['address'] as DocumentData | undefined) ?? {};
    return {
      ...common,
      reference: orderCode(doc['number']),
      address: [
        String(address['fullName'] ?? ''),
        String(address['addressLine'] ?? ''),
        [address['city'], address['province'], address['zip']].filter(Boolean).join(', '),
        String(address['mobile'] ?? ''),
      ].filter(Boolean),
      lines: items.map((item) => {
        const qty = Number(item['qty']) || 0;
        const unitPrice = Number(item['price']) || 0;
        return { description: String(item['name'] ?? ''), qty, unitPrice, amount: qty * unitPrice };
      }),
      subtotal: Number(doc['subtotal']) || 0,
      shippingFee: Number(doc['shippingFee']) || 0,
      total: Number(doc['total']) || 0,
    };
  }
  const amount = Number(payment['amount']) || Number(doc['quote']?.['amount']) || 0;
  const service = String(doc['serviceName'] ?? 'Service');
  return {
    ...common,
    reference: `${service}, ${slotLabel(doc['preferredDate'], doc['preferredTime'])}`,
    address: [],
    lines: [{ description: service, qty: 1, unitPrice: amount, amount }],
    subtotal: amount,
    shippingFee: 0,
    total: amount,
  };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function invoiceEmail(data: InvoiceData): { subject: string; text: string; html: string } {
  const what = data.reference.startsWith('ORD-') ? `order ${data.reference}` : data.reference;
  const paid = [
    data.method && `Paid by ${data.method}`,
    data.paymentReference && `ref ${data.paymentReference}`,
    data.paidAt && `on ${dateTime(data.paidAt)}`,
  ]
    .filter(Boolean)
    .join(', ');
  const rows = data.lines
    .map(
      (line) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #F5F5F5">${escapeHtml(line.description)}${
          line.qty > 1 ? ` <span style="color:#666666">× ${line.qty}</span>` : ''
        }</td>
        <td style="padding:8px 0;border-bottom:1px solid #F5F5F5;text-align:right;white-space:nowrap">${peso(line.amount)}</td>
      </tr>`,
    )
    .join('');
  const totals = (
    data.shippingFee
      ? [
          ['Subtotal', peso(data.subtotal)],
          ['Shipping', peso(data.shippingFee)],
        ]
      : []
  )
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 0;color:#666666">${label}</td><td style="padding:4px 0;text-align:right">${value}</td></tr>`,
    )
    .join('');

  return {
    subject: `Your IOTEL invoice ${data.number} for ${what}`,
    text:
      `Hi ${data.customerName},\n\n` +
      `Thank you for your payment. Here is your invoice ${data.number} for ${what}.\n\n` +
      data.lines
        .map(
          (line) =>
            `${line.description}${line.qty > 1 ? ` × ${line.qty}` : ''}: ${peso(line.amount)}`,
        )
        .join('\n') +
      (data.shippingFee ? `\nShipping: ${peso(data.shippingFee)}` : '') +
      `\nTotal paid: ${peso(data.total)}\n${paid ? `${paid}\n` : ''}\n` +
      `The invoice is attached as a PDF.\n\nIOTEL by Goldcomm`,
    html: `<!doctype html>
<html><body style="margin:0;padding:24px;background:#F5F5F5;font-family:Arial,Helvetica,sans-serif;color:#1A1A1A">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:8px">
    <tr><td style="padding:24px 24px 0">
      <div style="font-size:20px;font-weight:bold;letter-spacing:2px">IOTEL</div>
      <div style="font-size:12px;color:#C9A84C">by Goldcomm</div>
    </td></tr>
    <tr><td style="padding:24px">
      <p style="margin:0 0 8px">Hi ${escapeHtml(data.customerName)},</p>
      <p style="margin:0 0 16px">Thank you for your payment. Here is your invoice for ${escapeHtml(what)}.</p>
      <p style="margin:0 0 16px;font-size:13px;color:#666666">Invoice <strong style="color:#1A1A1A">${data.number}</strong> · ${longDate(data.issuedAt)}</p>
      <table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px">
        ${rows}
        ${totals}
        <tr>
          <td style="padding:8px 0;font-weight:bold">Total paid</td>
          <td style="padding:8px 0;text-align:right;font-weight:bold;color:#CC2020">${peso(data.total)}</td>
        </tr>
      </table>
      ${paid ? `<p style="margin:16px 0 0;font-size:13px;color:#666666">${escapeHtml(paid)}</p>` : ''}
      <p style="margin:16px 0 0;font-size:13px;color:#666666">The invoice is attached as a PDF.</p>
    </td></tr>
  </table>
</body></html>`,
  };
}

function invoicePdf(data: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: { Title: `Invoice ${data.number}` },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 50;
    const right = doc.page.width - 50;
    const width = right - left;

    // Header: brand on the left, seller details on the right.
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#1A1A1A').text('IOTEL', left, 50);
    doc.font('Helvetica').fontSize(10).fillColor('#C9A84C').text('by Goldcomm');
    const brandBottom = doc.y;
    const seller = [
      SELLER_NAME.value(),
      SELLER_ADDRESS.value(),
      SELLER_TIN.value() && `TIN ${SELLER_TIN.value()}`,
    ]
      .filter(Boolean)
      .join('\n');
    doc
      .fontSize(9)
      .fillColor('#666666')
      .text(seller, left + width / 2, 52, { width: width / 2, align: 'right' });
    doc.y = Math.max(doc.y, brandBottom);

    doc.moveDown(3);
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#1A1A1A').text('INVOICE', left);
    doc.font('Helvetica').fontSize(10).fillColor('#666666').text('Payment acknowledgement');
    doc.moveDown();

    const metaTop = doc.y;
    doc.fillColor('#1A1A1A').fontSize(10);
    doc.text(`Invoice no.: ${data.number}`, left, metaTop);
    doc.text(`Date: ${longDate(data.issuedAt)}`);
    doc.text(`For: ${data.reference}`, { width: width / 2 });
    doc.font('Helvetica-Bold').text('Billed to', left + width / 2, metaTop);
    // An order's delivery address starts with the recipient's name.
    doc
      .font('Helvetica')
      .text((data.address.length ? data.address : [data.customerName]).join('\n'), {
        width: width / 2,
      });
    doc.y = Math.max(doc.y, metaTop + 60);
    doc.moveDown(2);

    // Line items.
    const cols = {
      desc: left,
      qty: left + width * 0.55,
      unit: left + width * 0.65,
      amount: left + width * 0.82,
    };
    const head = doc.y;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Description', cols.desc, head);
    doc.text('Qty', cols.qty, head, { width: width * 0.1, align: 'right' });
    doc.text('Unit price', cols.unit, head, { width: width * 0.17, align: 'right' });
    doc.text('Amount', cols.amount, head, { width: width * 0.18, align: 'right' });
    doc
      .moveTo(left, doc.y + 4)
      .lineTo(right, doc.y + 4)
      .strokeColor('#1A1A1A')
      .stroke();
    doc.moveDown();

    doc.font('Helvetica');
    for (const line of data.lines) {
      const top = doc.y;
      doc.text(line.description, cols.desc, top, { width: width * 0.53 });
      const bottom = doc.y;
      doc.text(String(line.qty), cols.qty, top, { width: width * 0.1, align: 'right' });
      doc.text(php(line.unitPrice), cols.unit, top, { width: width * 0.17, align: 'right' });
      doc.text(php(line.amount), cols.amount, top, { width: width * 0.18, align: 'right' });
      doc.y = bottom + 6;
    }
    doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#F5F5F5').stroke();
    doc.moveDown();

    const total = (label: string, value: string, bold = false) => {
      const top = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(bold ? '#CC2020' : '#1A1A1A');
      doc.text(label, cols.unit - width * 0.15, top, { width: width * 0.32, align: 'right' });
      doc.text(value, cols.amount, top, { width: width * 0.18, align: 'right' });
      doc.moveDown(0.3);
    };
    if (data.shippingFee) {
      total('Subtotal', php(data.subtotal));
      total('Shipping', php(data.shippingFee));
    }
    total('Total paid', php(data.total), true);
    doc.moveDown(2);

    doc.font('Helvetica').fontSize(10).fillColor('#1A1A1A');
    doc.text(
      [
        data.method && `Payment method: ${data.method}`,
        data.paymentReference && `Payment reference: ${data.paymentReference}`,
        data.paidAt && `Paid on: ${dateTime(data.paidAt)}`,
      ]
        .filter(Boolean)
        .join('\n'),
      left,
    );

    doc
      .fontSize(8)
      .fillColor('#666666')
      .text(
        'This document acknowledges your payment to Goldcomm Corporation through IOTEL. Thank you for your purchase.',
        left,
        doc.page.height - 80,
        { width, align: 'center' },
      );
    doc.end();
  });
}

// ── Sending ──────────────────────────────────────────────────────────────────

/**
 * Emails the invoice of a paid order or booking to the customer's account email (from Firebase Auth, not the
 * document's `customerEmail`, which a booking's customer writes themselves).
 *
 * `auto` (the PayMongo triggers) skips anything that already has an invoice number, so a repeated trigger never sends
 * twice; by hand, it refuses a resend within RESEND_COOLDOWN_MS. Returns false when it skipped.
 */
export async function sendInvoice(
  kind: Kind,
  id: string,
  by: Actor,
  auto = false,
): Promise<boolean> {
  const ref = db.doc(`${collectionOf(kind)}/${id}`);
  const counterRef = db.doc('counters/invoices');

  const claimed = await db.runTransaction(async (tx) => {
    const [snap, counter] = await tx.getAll(ref, counterRef);
    if (!snap.exists) throw new HttpsError('not-found', 'This could not be found.');
    if (snap.get('payment.status') !== 'Paid') {
      throw new HttpsError('failed-precondition', 'An invoice is sent only for a paid payment.');
    }
    const invoice = snap.get('invoice') as InvoiceRecord | undefined;
    if (auto && invoice) return null;
    const lastAttempt = invoice?.attemptAt?.toMillis() ?? 0;
    if (Date.now() - lastAttempt < RESEND_COOLDOWN_MS) {
      throw new HttpsError(
        'resource-exhausted',
        'The invoice was sent (or tried) less than a minute ago. Please wait a minute.',
      );
    }
    let number = invoice?.number;
    if (!number) {
      const next = (Number(counter.get('last')) || 0) + 1;
      number = `INV-${String(next).padStart(6, '0')}`;
      tx.set(counterRef, { last: next }, { merge: true });
    }
    tx.update(ref, { 'invoice.number': number, 'invoice.attemptAt': Timestamp.now() });
    return { doc: snap.data()!, number };
  });
  if (!claimed) return false;

  const { doc, number } = claimed;
  const customerId = String(doc['customerId'] ?? '');
  const to = customerId
    ? await getAuth()
        .getUser(customerId)
        .then(
          (u) => u.email,
          () => undefined,
        )
    : undefined;
  if (!to)
    throw new HttpsError('failed-precondition', "The customer's account has no email address.");

  const data = buildInvoice(kind, doc, number);
  try {
    await sendMail({
      to,
      ...invoiceEmail(data),
      attachments: [
        {
          filename: `${number}.pdf`,
          content: await invoicePdf(data),
          contentType: 'application/pdf',
        },
      ],
    });
  } catch (err) {
    logger.error('Invoice email failed', { kind, id, number, err });
    throw new HttpsError(
      'unavailable',
      "We couldn't send the invoice right now. Please try again in a minute.",
    );
  }

  await ref.update({
    'invoice.sentAt': FieldValue.serverTimestamp(),
    'invoice.sentTo': to,
    'invoice.sentBy': by.id,
    'invoice.sentByName': by.name,
    'invoice.sendCount': FieldValue.increment(1),
  });
  const label =
    kind === 'order'
      ? orderCode(doc['number'])
      : `${doc['serviceName'] ?? 'Service'} · ${doc['customerName'] ?? 'customer'}`;
  await logActivity({
    category: 'payment',
    action: 'invoice.sent',
    summary: `Emailed invoice ${number} for ${label} to ${to}`,
    actor: by,
    targetType: kind,
    targetId: id,
    targetLabel: label,
    amount: data.total,
  });
  logger.info('Invoice sent', { kind, id, number });
  return true;
}

/** For callables that send the invoice after their own work: the payment stands even if the email fails. */
export async function trySendInvoice(
  kind: Kind,
  id: string,
  by: Actor,
): Promise<string | undefined> {
  try {
    await sendInvoice(kind, id, by);
    return undefined;
  } catch (err) {
    return err instanceof HttpsError ? err.message : "We couldn't send the invoice.";
  }
}

/** A PayMongo payment just became Paid on an order or booking that isn't cancelled. */
function paidByPaymongo(
  before: DocumentData | undefined,
  after: DocumentData | undefined,
): boolean {
  return (
    before?.['payment']?.['status'] !== 'Paid' &&
    after?.['payment']?.['status'] === 'Paid' &&
    (after['payment']['provider'] ?? 'paymongo') === 'paymongo' &&
    after['status'] !== 'Cancelled'
  );
}

async function autoSend(
  kind: Kind,
  id: string,
  before?: DocumentData,
  after?: DocumentData,
): Promise<void> {
  if (!paidByPaymongo(before, after)) return;
  try {
    await sendInvoice(kind, id, SYSTEM, true);
  } catch (err) {
    // Staff can still send it by hand from the order or booking.
    logger.error('Automatic invoice failed', { kind, id, err });
  }
}

export const onOrderPaid = onDocumentUpdated(
  { document: 'orders/{orderId}', secrets: MAIL_SECRETS },
  (event) =>
    autoSend('order', event.params.orderId, event.data?.before.data(), event.data?.after.data()),
);

export const onBookingPaid = onDocumentUpdated(
  { document: 'bookings/{bookingId}', secrets: MAIL_SECRETS },
  (event) =>
    autoSend(
      'booking',
      event.params.bookingId,
      event.data?.before.data(),
      event.data?.after.data(),
    ),
);

/** Staff: emails (or re-emails) the invoice of a paid order or booking. */
export const sendInvoiceEmail = onCall({ secrets: MAIL_SECRETS }, async (req) => {
  const staff = await requireStaff(req);
  const kind = kindOf(req.data?.kind);
  const id = docId(req.data?.id);
  await sendInvoice(kind, id, { id: staff.uid, name: staff.name, role: staff.role });
  return { ok: true };
});

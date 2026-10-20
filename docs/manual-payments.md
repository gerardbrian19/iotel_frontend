# Manual payments: bank / GCash transfers and on-site payments

Besides PayMongo (`docs/paymongo-setup.md`), customers can pay:

- **By bank or GCash transfer** (orders and service bookings): they send the money to one of Goldcomm's accounts,
  then enter the reference number, the amount and when they sent it, and upload a screenshot. Staff check that the
  money arrived and approve or reject it.
- **On site** (service bookings only, when staff allow it on the quotation): the customer chooses "Pay on site", the
  booking counts as booked, and staff record the payment at the shop.

As with PayMongo, the app never writes `payment` itself; Cloud Functions do (`functions/src/manual-payments.ts`,
`refundPayment` in `functions/src/payments.ts`).

## Setup

1. **Turn on Firebase Storage** in the Firebase Console (Build → Storage → Get started). The default bucket is
   `iotel-e9a72.firebasestorage.app`, already in `src/environments/environment.ts`.
2. **Deploy** functions and both rule sets:
   ```bash
   firebase deploy --only functions,firestore:rules,storage
   ```
   `storage.rules` reads users' roles from Firestore (`firestore.get`). On the first deploy the CLI asks to grant
   Storage access to Firestore; accept it, or staff won't be able to open screenshots.
3. **Add the accounts** at `/admin/payment-receivers` (admins only): GCash (number, account name, QR code) and/or bank
   accounts (bank, account name and number, branch, QR code if any). Only active accounts are shown to customers,
   and the "Bank / GCash transfer" option appears at checkout only once one is active.

## Flow

**Orders.** At checkout the customer picks _Bank / GCash transfer_. `createOrderCheckout` (`provider: 'manual'`)
creates the order (Pending, payment Unpaid, `payment.manual.state = 'awaiting'`) without a PayMongo checkout, and
the app opens the order's confirmation page, where the customer finds the accounts and sends the proof:

1. The screenshot is uploaded to Storage under `paymentProofs/{uid}/order-{orderId}/…` (≤ 5 MB, shrunk to 2000 px).
2. `submitManualPayment` checks the order, the account and the file, refuses a reference number already used on
   that account (`manualReferences/{receiverId}_{REF}`), and stores the proof (`state: 'submitted'`).
3. Staff see it in **Payments** (`/staff/payments`, `/admin/payments`, with a count in the menu), on the order and on
   the dashboard. They find the transfer in the bank or GCash app by its reference number and amount, then:
   - **Approve** (`reviewManualPayment`): the order is Paid (`method` `gcash` or `bank:BPI`, `paymentId` = the
     reference number) and is processed as usual. Stock is still taken when staff start processing.
   - **Reject** with a reason: the customer sees it and can send the proof again (up to 5 attempts; the reference is
     freed so a mistyped one can be corrected). Earlier attempts are kept in `payment.manual.history`.

Transfer orders are **never cancelled automatically** (`expireUnpaidOrders` only handles PayMongo orders). Staff can
cancel one that is never paid, as with any unpaid order. While a proof is waiting for review, neither the customer nor
staff can cancel the order (rules): reject it first.

**Bookings.** Once staff send the quotation (with or without "Let the customer pay on site"), the customer chooses
_Pay online_, _Bank / GCash transfer_ (same proof flow as orders, posted in the booking's chat) or _Pay on site_
(`chooseOnsitePayment`; status stays Confirmed, shown as "Booked · Pay on site"). Staff record money received at the
shop with **Record payment** (`recordOnsitePayment`: method, amount, receipt number, and optionally completing the
booking in the same step). The customer can still switch to paying online before then. While a transfer proof is
under review, the quote can't be changed and the booking can't be cancelled.

**Refunds.** "Cancel & refund" on a transfer or on-site payment does not go through PayMongo: staff send the money
back themselves and must enter that refund's reference (`payment.refundReference`). The rest (cancel, restock a
processing order, free a booking's slot, chat message) is the same as for PayMongo.

## Verifying a transfer: checklist for staff

- The amount and the reference number match what arrived in the account shown on the proof (the proof keeps a copy of
  the account even if it is edited later). A different amount is shown in red; reject it, or ask the customer in
  chat to send the difference.
- The date is plausible, and the screenshot matches the reference number.
- Reject with a clear reason the customer can act on.

Every step is in the activity log (`payment.proofSubmitted`, `payment.received`, `payment.rejected`,
`payment.onsiteChosen`, `payment.refunded`, and `receiver.*` for changes to the accounts, account numbers included).

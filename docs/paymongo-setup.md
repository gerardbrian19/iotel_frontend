# PayMongo setup

IOTEL takes every payment (orders and service bookings) through PayMongo's hosted checkout. The code is in
`functions/src/payments.ts` (backend) and `src/app/core/payments/payment-methods.ts` (app). This guide sets it up in
**test mode**, which works before the PayMongo account is verified; going live later only swaps the keys.

## How it works

```
Checkout → createOrderCheckout (function) → order: Pending, payment Unpaid + PayMongo checkout → customer pays there
PayMongo → paymongoWebhook (function) → payment Paid → staff start processing → ship → deliver
Booking: staff confirm & quote → customer presses Pay → createBookingCheckout → same webhook → booking Paid
```

- Customers can't create orders or touch `payment` (firestore.rules). The server prices the order from `products`.
- Only the webhook marks a payment `Paid`. Its signature is checked with `PAYMONGO_WEBHOOK_SECRET`, and each event is
  applied once (`paymongoEvents/{eventId}`).
- Orders still unpaid after 60 minutes are cancelled by `expireUnpaidOrders` (every 15 min). When an unpaid order or
  booking is cancelled, `onOrderCancelled` / `onBookingCancelled` expire its PayMongo checkout.
- Staff refund with "Cancel & refund" / "Refund payment" (`refundPayment`): a full refund through PayMongo that also
  cancels the order or booking, restocks a Processing order and frees a booking's slot. Shipped/delivered orders and
  completed bookings are refunded from the PayMongo dashboard.
- Stock is still taken when staff start processing, not at checkout.

## 1. PayMongo account (test mode)

1. Sign up at <https://dashboard.paymongo.com>. Test mode is available right away, no documents needed.
2. Developers → API Keys: copy the **test secret key** (`sk_test_…`). The public key isn't used.

## 2. Secrets and settings

```bash
firebase functions:secrets:set PAYMONGO_SECRET_KEY        # paste sk_test_…
firebase functions:secrets:set PAYMONGO_WEBHOOK_SECRET    # temporary value for now, e.g. "pending"; real one in step 4
```

`APP_ORIGINS` (in `functions/.env`, comma-separated) lists the sites PayMongo may send customers back to. It defaults to
`http://localhost:4200`; add the deployed site's origin when there is one:

```
APP_ORIGINS=http://localhost:4200,https://iotel-e9a72.web.app
```

## 3. Deploy

Deploy the rules together with the functions and the app: the new rules reject the old app's order writes.

```bash
firebase deploy --only functions,firestore:rules
```

The first deploy of a scheduled function may ask to enable Cloud Scheduler; say yes.

## 4. Register the webhook

```bash
PAYMONGO_SECRET_KEY=sk_test_… npm run paymongo:webhook -- \
  https://asia-southeast1-iotel-e9a72.cloudfunctions.net/paymongoWebhook
```

It prints the webhook's signing secret (`whsk_…`). Store it and redeploy so the function picks it up:

```bash
firebase functions:secrets:set PAYMONGO_WEBHOOK_SECRET    # paste whsk_…
firebase deploy --only functions:paymongoWebhook
```

`npm run paymongo:webhook -- --list` shows the registered webhooks. The secret is shown only once; to get a new one,
delete the webhook in the PayMongo dashboard and register it again.

## 5. Clean up old test data

Orders and bookings from the manual-payment days (GCash/bank reference numbers, Cash on Delivery) don't fit the new
payment shape. Delete them in the Firebase Console (`orders`, `bookings` and their `bookingSlots`) before testing.

## 6. Test

Run `npm start` and sign in as a customer.

- **Order paid:** add to cart → Checkout → Pay → on PayMongo's test page pay with card `4343 4343 4343 4345` (any
  future expiry, any CVC) or choose GCash/Maya and press "Authorize Test Payment". The confirmation page shows
  "Confirming your payment…" and turns to **Payment received!** within a few seconds.
- **Not paid:** leave the PayMongo page (or "Fail Test Payment") → the order stays "Awaiting payment" with **Pay now**.
  After 60 minutes it is cancelled automatically (to try it sooner, lower `UNPAID_ORDER_TTL_MS` temporarily).
- **Staff:** start processing a paid order (stock drops) → ship → deliver. On another paid order, use
  **Cancel & refund**; the refund shows in the PayMongo dashboard (Payments → the payment → Refunds).
- **Booking:** book a service → staff "Confirm & quote" → customer presses **Pay ₱…** in My Bookings → after paying,
  the booking is Paid and the chat says "Payment received via …". Changing the quote before payment opens a new checkout.
- **Webhook:** PayMongo dashboard → Developers → Webhooks shows deliveries. A resent event doesn't change anything twice.
- Logs: `firebase functions:log` (look for `Checkout paid`, `Payment refunded`, `PayMongo request failed`).

PayMongo test mode doesn't email receipts (`send_email_receipt: false`), so testing never sends real emails.

## Going live

Once Goldcomm's PayMongo account is verified:

1. Set `PAYMONGO_SECRET_KEY` to the live key (`sk_live_…`).
2. Register the webhook again with the live key (`npm run paymongo:webhook -- <url>`) and store its new secret in
   `PAYMONGO_WEBHOOK_SECRET`.
3. `firebase deploy --only functions`.
4. Update the Terms / Privacy Policy `confirm` notes (merchant agreement, receipts) and make one small real payment.

To offer more methods (online banking, BillEase, …) once they are enabled on the account, add them to
`PAYMENT_METHOD_TYPES` in `functions/src/payments.ts` and `ACCEPTED_PAYMENT_METHODS` in `payment-methods.ts`.

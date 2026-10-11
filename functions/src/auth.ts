/**
 * Sign-in functions: the emailed sign-in code (customers, and staff/admins before they set up an authenticator)
 * and the admin account actions ("reset authenticator", "remove customer account"). See docs/auth-upgrade-plan.md.
 *
 * Enforcement lives in firestore.rules: a customer session counts only when the ID token carries the custom claim
 * `otpAuthTime` equal to its own `auth_time`, which `verifyLoginCode` sets. A new sign-in has a new `auth_time`, so the
 * claim stops matching until a new code is entered.
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineInt, defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { createTransport, Transporter } from 'nodemailer';
import { db } from './app.js';
import { TWO_STEP_SIGN_IN } from './flags.js';

// SMTP relay (Resend today: login `resend`, password = API key). Host/port/sender live in functions/.env;
// the login and key are Secret Manager secrets.
const SMTP_HOST = defineString('SMTP_HOST', { default: 'smtp.resend.com' });
const SMTP_PORT = defineInt('SMTP_PORT', { default: 465 });
const MAIL_FROM = defineString('MAIL_FROM', {
  description: 'Sender address on the domain verified in Resend (just the address, e.g. no-reply@iotel.app)',
});
const SMTP_USER = defineSecret('SMTP_USER');
const SMTP_PASS = defineSecret('SMTP_PASS');

const SENDER_NAME = 'IOTEL by Goldcomm';
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;
const HOUR_MS = 60 * 60 * 1000;


interface LoginCodeDoc {
  hash: string;
  salt: string;
  expiresAt: number;
  attempts: number;
  /** `auth_time` of the sign-in the code was issued for. */
  authTime: number;
  /** Send times (ms) within the last hour, for the resend limits. */
  sentAt: number[];
}

let transporter: Transporter | null = null;

function mailer(): Transporter {
  transporter ??= createTransport({
    host: SMTP_HOST.value(),
    port: SMTP_PORT.value(),
    secure: SMTP_PORT.value() === 465,
    auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
  });
  return transporter;
}

function hashCode(code: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

function requireSignIn(req: CallableRequest): { uid: string; authTime: number; email: string } {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in again.');
  const { uid, token } = req.auth;
  if (!token.email) throw new HttpsError('failed-precondition', 'Your account has no email address.');
  return { uid, authTime: token.auth_time, email: token.email };
}

function codeEmail(code: string): { subject: string; text: string; html: string } {
  const minutes = CODE_TTL_MS / 60_000;
  return {
    subject: `${code} is your IOTEL sign-in code`,
    text:
      `Your IOTEL sign-in code is ${code}.\n\n` +
      `It expires in ${minutes} minutes. If you didn't try to sign in, change your password; ` +
      `someone may know it.\n\nIOTEL by Goldcomm`,
    html: `<!doctype html>
<html><body style="margin:0;padding:24px;background:#F5F5F5;font-family:Arial,Helvetica,sans-serif;color:#1A1A1A">
  <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:8px">
    <tr><td style="padding:24px 24px 0">
      <div style="font-size:20px;font-weight:bold;letter-spacing:2px">IOTEL</div>
      <div style="font-size:12px;color:#C9A84C">by Goldcomm</div>
    </td></tr>
    <tr><td style="padding:24px">
      <p style="margin:0 0 16px">Your sign-in code is:</p>
      <p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:8px;color:#CC2020">${code}</p>
      <p style="margin:0 0 8px">It expires in ${minutes} minutes.</p>
      <p style="margin:0;font-size:13px;color:#666666">If you didn't try to sign in, change your password; someone may know it.</p>
    </td></tr>
  </table>
</body></html>`,
  };
}

/** Emails a new 6-digit code for the caller's current sign-in (identified by the token's `auth_time`). */
export const sendLoginCode = onCall({ secrets: [SMTP_USER, SMTP_PASS] }, async (req) => {
  const { uid, authTime, email } = requireSignIn(req);
  const ref = db.doc(`loginCodes/${uid}`);
  const now = Date.now();
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const salt = randomBytes(16).toString('hex');

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const recent = ((snap.get('sentAt') as number[] | undefined) ?? []).filter((t) => t > now - HOUR_MS);
    const last = recent.length ? Math.max(...recent) : 0;
    // The cooldown is for resends within one sign-in; a fresh sign-in gets its code at once (still capped per hour).
    if (snap.get('authTime') === authTime && now - last < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - last)) / 1000);
      throw new HttpsError('resource-exhausted', `Please wait ${wait} seconds before asking for another code.`, {
        retryAfterSeconds: wait,
      });
    }
    if (recent.length >= MAX_SENDS_PER_HOUR) {
      throw new HttpsError('resource-exhausted', 'Too many codes requested. Please try again in an hour.');
    }
    const doc: LoginCodeDoc = {
      hash: hashCode(code, salt),
      salt,
      expiresAt: now + CODE_TTL_MS,
      attempts: 0,
      authTime,
      sentAt: [...recent, now],
    };
    tx.set(ref, doc);
  });

  try {
    await mailer().sendMail({ from: { name: SENDER_NAME, address: MAIL_FROM.value() }, to: email, ...codeEmail(code) });
  } catch (err) {
    logger.error('Sign-in code email failed', { uid, err });
    throw new HttpsError('unavailable', "We couldn't send the code right now. Please try again in a minute.");
  }
  return { resendAfterSeconds: RESEND_COOLDOWN_MS / 1000, expiresInSeconds: CODE_TTL_MS / 1000 };
});

/** Checks the emailed code; on success marks this sign-in (custom claim) and the email address as verified. */
export const verifyLoginCode = onCall(async (req) => {
  const { uid, authTime } = requireSignIn(req);
  const code = typeof req.data?.code === 'string' ? req.data.code.trim() : '';
  if (!/^\d{6}$/.test(code)) throw new HttpsError('invalid-argument', 'Enter the 6-digit code from the email.');

  const ref = db.doc(`loginCodes/${uid}`);
  const now = Date.now();
  // Throwing inside the transaction would roll back the attempt counter, so the outcome is returned instead.
  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return 'missing' as const;
    const doc = snap.data() as LoginCodeDoc;
    if (doc.authTime !== authTime) return 'missing' as const;
    if (doc.expiresAt < now) return 'expired' as const;
    if (doc.attempts >= MAX_ATTEMPTS) return 'locked' as const;
    const expected = Buffer.from(doc.hash, 'hex');
    const actual = Buffer.from(hashCode(code, doc.salt), 'hex');
    if (!timingSafeEqual(expected, actual)) {
      tx.update(ref, { attempts: doc.attempts + 1 });
      return MAX_ATTEMPTS - doc.attempts - 1;
    }
    // Keep the send history for the resend limits; drop the code itself.
    tx.set(ref, { sentAt: doc.sentAt });
    return 'ok' as const;
  });

  switch (outcome) {
    case 'missing':
      throw new HttpsError('failed-precondition', 'No active code for this sign-in. Please send a new code.');
    case 'expired':
      throw new HttpsError('deadline-exceeded', 'That code has expired. Please send a new code.');
    case 'locked':
      throw new HttpsError('resource-exhausted', 'Too many wrong codes. Please send a new code.');
    case 'ok':
      break;
    default:
      throw new HttpsError(
        'permission-denied',
        outcome > 0
          ? `That code is incorrect. ${outcome} ${outcome === 1 ? 'try' : 'tries'} left.`
          : 'Too many wrong codes. Please send a new code.',
      );
  }

  const auth = getAuth();
  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, { ...(user.customClaims ?? {}), otpAuthTime: authTime });
  if (!user.emailVerified) await auth.updateUser(uid, { emailVerified: true });
  return { ok: true };
});

/** Admin action: removes another account's authenticator app and signs it out everywhere. */
export const resetAuthenticator = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in again.');
  if (TWO_STEP_SIGN_IN && req.auth.token.firebase?.sign_in_second_factor !== 'totp') {
    throw new HttpsError('permission-denied', 'Sign in with your authenticator app first.');
  }
  const caller = await db.doc(`users/${req.auth.uid}`).get();
  if (caller.get('role') !== 'admin') throw new HttpsError('permission-denied', 'Only admins can do this.');

  const uid = typeof req.data?.uid === 'string' ? req.data.uid : '';
  if (!uid) throw new HttpsError('invalid-argument', 'Missing account.');
  if (uid === req.auth.uid) {
    throw new HttpsError('failed-precondition', 'You can replace your own authenticator from your Account page.');
  }

  const auth = getAuth();
  try {
    await auth.updateUser(uid, { multiFactor: { enrolledFactors: null } });
  } catch (err) {
    logger.error('Authenticator reset failed', { uid, err });
    throw new HttpsError('not-found', 'That account could not be found.');
  }
  await auth.revokeRefreshTokens(uid);
  logger.info('Authenticator reset', { uid, by: req.auth.uid });
  return { ok: true };
});

const OPEN_ORDER_STATUSES = ['Pending', 'Processing', 'Shipped'];
const OPEN_BOOKING_STATUSES = ['Pending', 'Confirmed', 'Paid'];

/**
 * Why the customer can't be removed yet: an order or booking still in progress, or a cancelled one whose payment
 * still has to be refunded. Null when there is nothing left. Each check reads at most one document.
 */
async function openWork(uid: string): Promise<string | null> {
  const first = (collection: string, field: string, values: string[], extra?: [string, string]) => {
    let query = db.collection(collection).where('customerId', '==', uid).where(field, 'in', values);
    if (extra) query = query.where(extra[0], '==', extra[1]);
    return query.limit(1).get();
  };
  const [orders, bookings, unrefundedOrders, unrefundedBookings] = await Promise.all([
    first('orders', 'status', OPEN_ORDER_STATUSES),
    first('bookings', 'status', OPEN_BOOKING_STATUSES),
    first('orders', 'status', ['Cancelled'], ['payment.status', 'Paid']),
    first('bookings', 'status', ['Cancelled'], ['payment.status', 'Paid']),
  ]);
  if (!orders.empty) return 'This customer has an order in progress. Complete or cancel it before removing the account.';
  if (!bookings.empty) {
    return 'This customer has a service booking in progress. Complete or cancel it before removing the account.';
  }
  if (!unrefundedOrders.empty || !unrefundedBookings.empty) {
    return 'This customer has a cancelled order or booking that still has to be refunded. Refund it before removing the account.';
  }
  return null;
}

/**
 * Admin action: permanently removes a CUSTOMER account (Auth login, profile, favorites, addresses, sign-in codes).
 * Staff and admin accounts are protected: the target's role is checked here, on the server, so the button being
 * hidden in the app is not the only guard. Orders, bookings and chats are kept as business records. Refused while
 * the customer has an order or booking still in progress, so nothing paid or shipping is left without an owner.
 *
 * The customer may be signed in meanwhile, and an ID token stays valid for up to an hour after the login is removed
 * (rules and callables don't check revocation). So the order matters:
 * 1. the login is disabled and its refresh tokens revoked (no new sessions or tokens);
 * 2. the profile is deleted together with a `deletedAccounts/{uid}` marker. From then on firestore.rules (bookings,
 *    favorites, addresses need the customer's profile; a profile can't be re-created under the marker) and the
 *    payment functions (they read the profile's role) refuse anything the old token tries;
 * 3. open work is checked again, which catches an order or booking created just before step 2. If there is any, the
 *    profile is put back and the login re-enabled;
 * 4. the rest is removed: favorites, addresses, sign-in codes and the login itself.
 */
export const deleteCustomerAccount = onCall(async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in again.');
  if (TWO_STEP_SIGN_IN && req.auth.token.firebase?.sign_in_second_factor !== 'totp') {
    throw new HttpsError('permission-denied', 'Sign in with your authenticator app first.');
  }
  const caller = await db.doc(`users/${req.auth.uid}`).get();
  if (caller.get('role') !== 'admin') throw new HttpsError('permission-denied', 'Only admins can do this.');

  const uid = typeof req.data?.uid === 'string' ? req.data.uid : '';
  if (!uid) throw new HttpsError('invalid-argument', 'Missing account.');

  const profileRef = db.doc(`users/${uid}`);
  const markerRef = db.doc(`deletedAccounts/${uid}`);
  const profile = await profileRef.get();
  if (!profile.exists) throw new HttpsError('not-found', 'That account could not be found.');
  if (profile.get('role') !== 'customer') {
    throw new HttpsError('permission-denied', 'Staff and admin accounts are protected and cannot be removed.');
  }
  const blocked = await openWork(uid);
  if (blocked) throw new HttpsError('failed-precondition', blocked);

  const auth = getAuth();
  const setLoginDisabled = async (disabled: boolean) => {
    try {
      await auth.updateUser(uid, { disabled });
      if (disabled) await auth.revokeRefreshTokens(uid);
    } catch (err) {
      if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
    }
  };

  try {
    await setLoginDisabled(true);
  } catch (err) {
    logger.error('Customer account removal failed', { uid, err });
    throw new HttpsError('unavailable', "The account couldn't be removed. Please try again.");
  }

  const data = profile.data()!;
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(profileRef);
    if (fresh.exists && fresh.get('role') !== 'customer') {
      throw new HttpsError('permission-denied', 'Staff and admin accounts are protected and cannot be removed.');
    }
    tx.set(markerRef, { removedAt: FieldValue.serverTimestamp(), removedBy: req.auth!.uid });
    tx.delete(profileRef);
  }).catch(async (err) => {
    await setLoginDisabled(false);
    throw err;
  });

  const lateWork = await openWork(uid);
  if (lateWork) {
    const batch = db.batch();
    batch.set(profileRef, data);
    batch.delete(markerRef);
    await batch.commit();
    await setLoginDisabled(false);
    throw new HttpsError('failed-precondition', lateWork);
  }

  // Favorites and addresses (the profile document itself is already gone).
  await db.recursiveDelete(profileRef);
  await db.doc(`loginCodes/${uid}`).delete();
  try {
    await auth.deleteUser(uid);
  } catch (err) {
    // The login is disabled and has no profile, so it can't be used; log it so it can be removed by hand.
    if ((err as { code?: string }).code !== 'auth/user-not-found') {
      logger.error('Customer login could not be deleted after its data was removed', { uid, err });
    }
  }
  logger.info('Customer account removed', { uid, by: req.auth.uid });
  return { ok: true };
});

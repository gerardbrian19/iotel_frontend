# IOTEL sign-in upgrade: email code for customers, authenticator app for staff/admin

**Status:** code written 2026-10-01, not yet deployed (see "Your setup steps" for what's left) · **Firebase project:** `iotel-e9a72` (Blaze, Identity Platform)


## Context

Today every sign-in uses only a password (`AuthService.login`). The earlier plan in `docs/auth-upgrade-plan.md`
(verify email → email link → TOTP → SMS) is replaced by these decisions:

- **Customers:** password, then a 6-digit code sent to their email, **on every login**.
- **Staff and admins:** password, then a code from an authenticator app (Firebase TOTP), **required**.
- Codes are emailed through **Brevo** (transactional SMTP relay; free plan 300 emails/day). Gmail App Passwords
  weren't available on the owner's account.
- Entering an emailed code correctly **marks the email as verified**, so there is no separate verification-link step.

Firebase can't send a 6-digit email code by itself, so the customer code needs our own server code: Cloud Functions
(allowed on Blaze) with nodemailer. TOTP uses Firebase's built-in multi-factor sign-in, which needs the free
Identity Platform upgrade and a verified email. The email code handles that verification.

**Enforcement.** Firestore rules check the ID token, so the check can't be skipped by bypassing the UI:
- Customer: the function sets a custom claim `otpAuthTime` equal to the token's `auth_time`. A new sign-in changes
  `auth_time`, so the claim stops matching until a new code is entered. Refreshing the token keeps `auth_time`, so
  the session stays valid.
- Staff and admins: `request.auth.token.firebase.sign_in_second_factor == 'totp'`.

## 1. Cloud Functions (`functions/`, new)

- New TypeScript Functions project in this repo: `firebase-functions` v2, `firebase-admin`, `nodemailer`. Region
  `asia-southeast1`. Add a `functions` block and the functions emulator (port 5001) to `firebase.json`.
- Provider-neutral SMTP via nodemailer:
  - secrets `SMTP_USER` and `SMTP_PASS` (`defineSecret`);
  - params `SMTP_HOST`, `SMTP_PORT` and `MAIL_FROM` (`defineString`, in `functions/.env`).
  - Brevo values: `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587` (STARTTLS, `secure: false`).
    - `SMTP_USER` is Brevo's SMTP login (looks like `xxxx@smtp-brevo.com`).
    - `SMTP_PASS` is a Brevo **SMTP key**, not the API key.
    - `MAIL_FROM` is `"IOTEL by Goldcomm" <verified sender>`.
  - Switching provider later means changing only these values.
  - If Brevo rejects a send (sender not verified, account not activated, daily limit reached), the function logs
    the SMTP error. The client gets `unavailable` and shows "We couldn't send the code right now".
- `sendLoginCode` (callable, caller must be signed in):
  - Generates a 6-digit code with `crypto.randomInt` and stores `{ hash (sha256 + salt), expiresAt: now + 10 min,
    attempts: 0, authTime: token.auth_time, sentAt[] }` in `loginCodes/{uid}`.
  - Resend limits: 60-second cooldown, at most 5 sends per hour. Too many → `resource-exhausted`.
  - Emails a short HTML and plain-text message ("Your IOTEL sign-in code is 123456. It expires in 10 minutes.").
- `verifyLoginCode({ code })`:
  - Requires the same `auth_time` the code was issued for, not expired, and fewer than 5 attempts. Each wrong code
    increments `attempts`; the comparison uses `timingSafeEqual`.
  - On success: deletes the doc, calls `setCustomUserClaims(uid, { ...existing, otpAuthTime: auth_time })` and
    `updateUser(uid, { emailVerified: true })`.
- `resetAuthenticator({ uid })`:
  - Allowed only for a caller whose profile role is `admin` and whose token has `sign_in_second_factor == 'totp'`;
    the caller can't reset themselves.
  - Calls `updateUser(uid, { multiFactor: { enrolledFactors: [] } })` then `revokeRefreshTokens(uid)`.
- The email code is open to every role. For staff and admins it only proves the email address (needed before TOTP
  setup); the rules give them nothing extra for it.

## 2. Firebase wiring (client)

- `core/firebase/firebase.ts`: add a `FUNCTIONS` injection token (`getFunctions(app, 'asia-southeast1')`, connected
  to the emulator when `useEmulators` is set).
- `core/firebase/auth-errors.ts`: add messages for `auth/multi-factor-auth-required` (internal), `auth/invalid-verification-code`,
  `auth/requires-recent-login`, `auth/missing-email`, and the function errors (`functions/resource-exhausted`,
  `functions/deadline-exceeded` → "Code expired", `functions/permission-denied` → "Wrong code").

## 3. `AuthService` (`core/services/auth.service.ts`)

- New signal `pendingStep: 'none' | 'email-code' | 'totp-code' | 'totp-enroll'`, plus a private
  `MultiFactorResolver`. `currentUser` stays `null` until every required step is done. Guards and `ProductService`
  (which keys off `currentUser`) then need no changes.
- `login(email, password)`:
  - `signInWithEmailAndPassword`. If it throws `auth/multi-factor-auth-required`, save the resolver
    (`getMultiFactorResolver`) and set `pendingStep = 'totp-code'`.
  - Otherwise read the profile:
    - customer → `sendLoginCode`, then `'email-code'`;
    - staff/admin with no TOTP → `sendLoginCode`, then `'email-code'`, followed by `'totp-enroll'`.
- `verifyEmailCode(code)`: call `verifyLoginCode`, then `getIdToken(true)` so the new claim is in the token.
  Customer → publish the user. Staff/admin → `'totp-enroll'`.
- `resendEmailCode()`.
- `verifyTotp(code)`: `TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code)` → `resolver.resolveSignIn`,
  then publish the user.
- Enrollment helpers, used by login and by the account page:
  - `startTotpEnrollment()`: `multiFactor(user).getSession()` → `TotpMultiFactorGenerator.generateSecret` → returns
    `{ secretKey, qrUrl: secret.generateQrCodeUrl(email, 'IOTEL') }`.
  - `finishTotpEnrollment(code)`: `assertionForEnrollment` → `enroll(..., 'Authenticator app')`.
  - `totpEnrolled()` and `unenrollTotp()`.
- After first enrollment during login: sign out and tell the user to sign in again with their authenticator code.
  The current token isn't a second-factor sign-in, so the rules would refuse it.
- `cancelPendingLogin()` signs out and clears the pending state.
- Session restore (`onAuthStateChanged`): publish the user only if `getIdTokenResult()` shows the step is complete:
  - customer: `claims.otpAuthTime === claims.auth_time`;
  - staff/admin: `signInSecondFactor === 'totp'`.
  Otherwise sign out, but not while a login is in progress (an `inFlight` flag, next to the existing `version` guard).
- `register()`: after the profile is created, `sendLoginCode` and go to `'email-code'`. The register page sends the
  user to the login page's code step.
- `changePassword(current, next)` (reauthenticate first).
  - Reauthenticating a TOTP-enrolled account also throws `multi-factor-auth-required`. Handle it with the same
    resolver and a code prompt.
- Password reset methods; see section 3a.

## 3a. Password reset (forgot password)

Uses Firebase's built-in reset email, sent from `noreply@iotel-e9a72.firebaseapp.com`. No function or Brevo quota
is involved. Firebase's Templates → SMTP settings could later route these through Brevo too, but that's optional.

- **`AuthService`:**
  - `sendPasswordReset(email)` → `sendPasswordResetEmail(auth, email, { url: <origin>/auth/login })`;
  - `checkResetCode(oobCode)` → `verifyPasswordResetCode`, which returns the account's email;
  - `confirmReset(oobCode, newPassword)` → `confirmPasswordReset`.
- **"Forgot password?" link** on the credentials step of the login page, going to a new public page
  `/auth/forgot-password`, which has:
  - an email field;
  - the same reply every time: "If an account exists for that email, we've sent a reset link". It never reveals
    whether an email is registered; email enumeration protection stays on.
  - a resend cooldown of 60 s.
- **New public page `/auth/reset-password?mode=resetPassword&oobCode=...`**, where the reset email's link lands:
  - shows the account email;
  - asks for the new password with the **same validators as registration** (`shared/utils/validators.ts`, plus
    confirm);
  - handles expired, used or invalid links with a "Request a new link" button;
  - on success goes to the login page with the message "Password changed, please sign in".
  - Until the production domain exists, Firebase's default reset page is used and its "Continue" goes back to
    `/auth/login`. The in-app page takes over once the template's action URL points at the app (see the setup
    steps).
- **Both pages** go under `guestGuard` in `auth.routes.ts`, and the login ↔ forgot links keep `returnUrl`.
- **Reset behavior:**
  - A reset does **not** skip the second step: after it, a customer still gets the email code and staff still need
    their authenticator.
  - Firebase invalidates the account's other sessions when the password changes.
  - Staff who lost both their password and their phone need an admin to "Reset authenticator" first.
- **Error messages:** add `auth/expired-action-code`, `auth/invalid-action-code` and `auth/user-disabled` for the
  reset pages.
- **Admin users page:** optional "Send password reset email" action per user (same `sendPasswordReset`).

## 4. UI

- **Login page** (`features/auth/login`): one component, with the step shown by `pendingStep()`:
  - credentials;
  - email code: 6-digit input, "Sent to j•••@gmail.com", Resend with a countdown, Cancel;
  - authenticator code;
  - authenticator setup: QR code via ng-zorro's built-in `nz-qrcode` (no new dependency), copyable secret key, and
    a confirmation code.
  - A "Forgot password?" link (section 3a).
  - Existing `returnUrl` handling is kept.
- **Register page:** after sign-up, goes to the email-code step. Name, password and the Terms/Privacy checkbox are
  unchanged.
- **Customer Security page:**
  - Un-comment its route and menu entry (`settings.routes.ts`, `settings.component.ts`).
  - Wire Change Password to the real API.
  - Replace the 2FA switch with a static note: "A code is emailed to you at every sign-in."
  - Remove the fake "Active Sessions" list.
- **Staff/Admin account pages:**
  - New `/staff/account` and `/admin/account` routes and shell menu entries, reusing the Security component. Move it
    to `shared/components/account-security` and make it role-aware.
  - For TOTP accounts it adds an "Authenticator app: On" status and a "Replace authenticator" option (remove, then
    set up again; needs a recent sign-in).
- **Admin users page** (`features/admin/users`): "Reset authenticator" action per staff or admin, behind a confirm,
  calling `resetAuthenticator`.
- Register every new `nz-icon` in `provideNzIcons` (`app.config.ts`), e.g. `mail`, `qrcode`, `copy`, `mobile`.

## 5. Firestore rules (`firestore.rules`)

```
function authed() { return request.auth != null; }
function secondStep() {
  return request.auth.token.get('otpAuthTime', -1) == request.auth.token.auth_time
    || hasTotp();
}
function hasTotp() { return request.auth.token.firebase.get('sign_in_second_factor', null) == 'totp'; }
function signedIn() { return authed() && secondStep(); }
// isAdmin / isStaff / isStaffOrAdmin: also require hasTotp()
```

- `users/{uid}` own `get` and self `create` use `authed()`: the profile is read before the code step, and a new
  profile is created at registration.
- New `loginCodes/{uid}`: `allow read, write: if false` (Admin SDK only).
- Check with the Rules Playground or a real test account that `auth_time`, the custom claim and
  `firebase.sign_in_second_factor` have exactly these names and types **before deploying**.

## 5a. Your setup steps (no coding; I'll write the scripts they run)

**Before I start**
1. ✅ Done. **Create a free Brevo account** at brevo.com. Fill in the company profile (Goldcomm Corporation, address, phone).
   Brevo sometimes reviews new accounts before allowing transactional email; if it asks, answer that these are
   one-time sign-in codes for your own customers.
2. ✅ Done (default sender = the account's Gmail for now; the domain address comes later). **Add and verify the sender:** Brevo → Senders, Domains & Dedicated IPs → **Senders** → Add a sender:
   - name "IOTEL by Goldcomm", plus the address the codes come from;
   - click the confirmation link Brevo emails to that address.
   - Better deliverability: once Goldcomm has its own domain, add it under **Domains** and set the DNS records Brevo
     gives you (DKIM, DMARC), then send from e.g. `no-reply@<domain>`. A free `@gmail.com` sender works for testing
     but is more likely to land in spam.
3. ✅ Done. **Create an SMTP key:** Brevo → your name (top right) → **SMTP & API** → **SMTP** tab → "Generate a new SMTP
   key", named "IOTEL functions".
   - Copy the key; it's shown once.
   - Also note the **Login** shown on that page (e.g. `xxxx@smtp-brevo.com`).
   - Keep both for step 7.
   - Don't use the "API keys" tab.
4. ✅ Done (CLI 15.30.0, has access to iotel-e9a72). **Install and sign in to the Firebase CLI** if you haven't: `npm i -g firebase-tools`, `firebase login` (as an
   owner of `iotel-e9a72`).
5. ✅ **Done 2026-10-01 (verified `subtype: IDENTITY_PLATFORM`).** **Upgrade Auth to Identity Platform.** Free at this size, nothing needs migrating, and required for the
   authenticator app. On 2026-10-01 the project was still plain Firebase Auth: `subtype: FIREBASE_AUTH`, MFA
   disabled.
   - The Firebase Console no longer has a separate upgrade button.
   - Use Google Cloud Console → **Identity Platform** (console.cloud.google.com/customer-identity, project
     `iotel-e9a72`) → **Enable Identity Platform**.
   - Or, in Firebase Console → Authentication → Sign-in method → Advanced → SMS Multi-factor Authentication, click
     Enable and accept the upgrade dialog, but leave SMS itself **off**.
   - TOTP doesn't appear in the Console; `scripts/enable-totp.mjs` turns it on.
6. **Set a budget alert:** Google Cloud Console → Billing → Budgets & alerts, e.g. ₱500/month with email alerts
   (Functions and Secret Manager cost almost nothing at this size, but Blaze has no hard cap).

**When I say the code is ready**

7. ✅ **Done 2026-10-01 (SMTP_USER v1, SMTP_PASS v1 enabled; exposed keys rotated).** **Store the SMTP secrets:** `firebase functions:secrets:set SMTP_USER` (paste the Brevo SMTP login), then
   `firebase functions:secrets:set SMTP_PASS` (paste the SMTP key). The CLI offers to enable the Secret Manager API;
   say yes. Tell me the verified sender address so I can put it in `functions/.env` as `MAIL_FROM`.
8. **Deploy the functions:** `firebase deploy --only functions`. On first deploy, accept enabling Cloud Functions,
   Cloud Build, Artifact Registry and Cloud Run.
9. **Turn on TOTP:** `node scripts/enable-totp.mjs`, which uses the service-account key in the repo root.
10. **Edit the password-reset email:** Firebase Console → Authentication → Templates → Password reset. Set the sender
    name to "IOTEL by Goldcomm" and adjust the subject and text. Once the site is hosted, click "Customize action
    URL" and set it to `https://<your-domain>/auth/reset-password`.
11. **Authorized domains:** Authentication → Settings → Authorized domains. Add the production domain once it exists.
12. **Test with real inboxes:** one test customer and one test staff account. If the first code emails land in spam,
    mark them "Not spam". Brevo → Transactional → Logs shows whether each email was delivered, bounced or blocked.

**Rollout**

13. **Tell staff and admins** to install Google Authenticator or Microsoft Authenticator. At their next login they
    will be asked to set it up, so give them a deadline.
14. **Make sure at least two admins have enrolled,** so one can reset the other.
15. **After everyone has enrolled,** deploy the rules: `firebase deploy --only firestore:rules`.
16. **Keep the service-account key file** (`iotel-e9a72-firebase-adminsdk-*.json`) backed up somewhere safe outside
    the repo. It's the last-resort way to reset the only admin's authenticator.
17. **Have Goldcomm review** the updated Privacy Policy and Terms text before release.

## 6. Console, scripts, rollout (technical order)

1. Firebase Console: upgrade Auth to **Identity Platform** (free).
2. `scripts/enable-totp.mjs` (Admin SDK `projectConfigManager().updateProjectConfig`, `adjacentIntervals: 5`) turns
   on TOTP.
3. Create the Brevo sender and SMTP key, then set the secrets. Deploy with `firebase deploy --only functions`.
4. Ship the app. Everyone is signed out once, because restored sessions have no second step yet.
5. Staff and admins enroll at their next login.
6. Deploy `firestore.rules` only after they have all enrolled.
7. `scripts/reset-mfa.mjs <email>`: last-resort reset for when the only admin loses their phone (uses the
   service-account key already in the repo root, which is gitignored).

## 7. Documents

- `core/legal/legal-documents.ts`:
  - Privacy Policy: sign-in codes sent by email through Brevo (Sendinblue SAS, France) as an email processor; authenticator enrollment for staff; email
    verification status.
  - Terms: Account Security section.
  - Bump `TERMS_VERSION` and `PRIVACY_VERSION`.
- Rewrite `docs/auth-upgrade-plan.md` to this plan.
- Update `CLAUDE.md`:
  - auth section;
  - the Functions project and its commands;
  - remove the outdated "needs Blaze" notes.
- Update the `otp-auth-plan` memory.
- Add `firebase-debug.log` and `functions/.env.local` to `.gitignore`. The debug log currently isn't ignored.
- `MAIL_FROM` in `functions/.env`: the user supplies the verified Brevo sender address; a placeholder until then.

## Critical files

`functions/src/index.ts` (new) · `firebase.json` · `src/app/core/firebase/firebase.ts` ·
`src/app/core/firebase/auth-errors.ts` · `src/app/core/services/auth.service.ts` ·
`src/app/features/auth/login/*` · `src/app/features/auth/register/register.component.ts` ·
`src/app/features/auth/{forgot-password,reset-password}/*` (new) · `src/app/features/auth/auth.routes.ts` ·
`src/app/features/customer/settings/security/*` (moves to `shared/components/account-security`) ·
`settings.routes.ts` / `settings.component.ts` · `staff.routes.ts` / `admin.routes.ts` and both shells ·
`src/app/features/admin/users/*` · `src/app/app.config.ts` (icons) · `firestore.rules` ·
`scripts/enable-totp.mjs`, `scripts/reset-mfa.mjs` (new) · `core/legal/legal-documents.ts`

## Verification

`npm run build` passes and `functions` builds with `tsc`. Then, against the real project with test accounts
(the Auth emulator doesn't support TOTP, and the Firestore emulator needs Java), check these by hand:

1. Customer login: the code email arrives and the right code opens the portal. A wrong code 5 times locks that code.
   Resend is blocked for 60 s. An expired code is rejected. `emailVerified` becomes true.
2. Register: the code step, then the portal; `legalAcceptance` is still saved.
3. Reload keeps the session. Closing the tab at the code step and reopening means signing in again.
4. New staff member (created at `/admin/users`): password → email code → authenticator setup → signed out → password
   → authenticator code → staff portal.
5. Wrong authenticator code; "Replace authenticator"; admin "Reset authenticator" signs that staff member out.
6. Forgot password with a registered email and with an unknown one: the same reply for both, and only the real
   account gets an email. The link opens the reset page, where a weak password is rejected and a new one works.
   Reusing or letting the link expire shows "Request a new link". After a reset, the login still asks for the
   email code or authenticator code. Change password: wrong current password, and a TOTP account.
7. After deploying the rules: a customer token without the claim, and a staff token without TOTP (e.g. via the
   Rules Playground), are refused. Normal flows (order, booking, chat, staff order actions) still work.

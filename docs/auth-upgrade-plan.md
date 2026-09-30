# IOTEL sign-in upgrade plan

**Status:** planned, not started · **Written:** 2026-09-30 · **Firebase project:** `iotel-e9a72` (Blaze plan)

Built from what the code does today: registration and login are password-only, the customer Security page
(`features/customer/settings/security`) exists but is unrouted, staff and admins have no account page, and admins
create staff accounts from a temporary secondary Firebase app (`UserService.createAccount`).

## Goals

- Customers can verify their email, reset a forgotten password, and sign in by email link.
- Staff and admins must use a one-time code (OTP) at login.
- Customers can turn OTP on if they want it.
- The Terms of Service and Privacy Policy (`core/legal/legal-documents.ts`) stay accurate throughout.

## Assumed choices (confirm before starting)

| Choice | Assumption |
|---|---|
| OTP type | Authenticator app (TOTP, free) first; SMS as an optional later phase |
| Who must use OTP | Staff and admins required, customers optional |
| What an unverified email blocks | Placing orders and booking services (browsing still works) |
| Password login | Stays; email link is an additional option |

## Firebase facts this plan relies on (checked 2026-09-30)

- Project Auth config: Email/Password on with `passwordRequired: true` (email link **off**); plain Firebase Auth
  (not Identity Platform); MFA disabled; email enumeration protection **on**; authorized domains `localhost`,
  `iotel-e9a72.firebaseapp.com`, `iotel-e9a72.web.app`.
- Daily limits on Blaze: 25,000 email-link sign-in emails, 100,000 verification emails, 10,000 password-reset emails.
  (Spark: 5 / 1,000 / 150.)
- **Completing an email-link sign-in removes any unverified password on that account.** No IOTEL account has a
  verified email yet, so Phase 1 must ship before Phase 2.
- Any MFA (TOTP or SMS) needs the free "Identity Platform" upgrade, and requires verified emails.
- SMS is charged per message, needs the SMS region policy (default: no regions allowed) and reCAPTCHA.
- Firebase TOTP has no backup codes; lost devices need an admin reset.

---

## Phase 0: Preparation (Console and setup, no app code)

1. **Upgrade to Identity Platform** (Firebase Console → Authentication → Settings). Free; nothing to migrate.
2. **Test environment:** a separate test Firebase project, or at least a staging web app, so OTP and email flows
   aren't tried first on real customers.
3. **Email templates** (Authentication → Templates): sender name "IOTEL by Goldcomm"; edit the verification,
   password-reset and sign-in-link texts. Optionally send from your own domain (needs DNS records).
4. **Authorized domains:** add the production web domain once it's hosted.
5. **Keep email enumeration protection on.** The app must never reveal whether an email has an account.

## Phase 1: Email verification + password reset + change password

*Ships first: needed by every later phase and prevents the email-link password loss.*

**Code**
- `AuthService`:
  - expose `emailVerified` from the Firebase user;
  - `sendVerificationEmail()`;
  - `refreshVerification()`: reload the user and force a fresh ID token so the rules see `email_verified`;
  - `sendPasswordReset(email)`;
  - `changePassword(current, next)`: reauthenticate with the current password first.
- Registration: send the verification email right after sign-up.
- Verification banner ("Verify your email", Resend, "I've verified") in the customer, staff and admin shells.
- Login page: "Forgot password?" link → small form that always answers "If an account exists, we've sent a link".
- Re-enable the customer Security page (route and menu item are commented out in `settings.routes.ts` /
  `settings.component.ts`). Wire Change Password for real; keep the two-factor block as a placeholder until Phase 3.
- New `/staff/account` and `/admin/account` pages reusing that security component (no copy).
- `UserService.createAccount`: send the verification email from the secondary app before it's deleted.

**Rules** (deploy after the app is live, so existing users see the banner first)
- `orders` and `bookings` `create`: also require `request.auth.token.email_verified == true`.

**Testing**
- Register → verify → place an order.
- Unverified user is blocked at checkout and sees the banner.
- Password reset; change password, including a wrong current password.
- Admin-created staff receive the verification email.

**Effort:** medium.

## Phase 2: Email link sign-in (passwordless)

*Ship after most active users have verified. Anyone who loses an unverified password to a link sign-in can use
"Forgot password".*

**Console:** enable "Email link (passwordless sign-in)" under the Email/Password provider.

**Code**
- `AuthService`:
  - `sendSignInLink(email, pending?)`: save the email in `localStorage` (plus name and consent for new sign-ups);
    `actionCodeSettings` = `{ url: <origin>/auth/finish, handleCodeInApp: true }`.
  - `completeSignInLink(url, email)`: `isSignInWithEmailLink` → `signInWithEmailLink`, then read or create the
    `users/{uid}` profile; new profiles get `legalAcceptance` if consent was given before the link was sent.
- Login page: "Password" / "Email me a link" tabs, then a "Check your inbox" screen.
- Register page: optional "Sign up with an email link instead"; name and the Terms/Privacy checkbox still required.
- New public `/auth/finish` page:
  - completes the sign-in, asking for the email again when the link is opened on another device;
  - handles expired or already-used links;
  - then navigates to the saved `returnUrl` or the user's portal.
- Staff/admin: no change. After Phase 3, their link sign-ins also get the OTP step (Firebase applies MFA to
  link sign-ins too).

**Rules:** none. Profile `create` already requires the profile email to equal the token email.

**Testing**
- Link on the same device and on another device.
- New customer via link; check `legalAcceptance` is saved.
- Expired and reused links.
- Account with an unverified password (documents the password-removal behavior).
- `returnUrl` redirect.

**Effort:** medium.

## Phase 3: OTP with an authenticator app (TOTP)

**Setup:** `scripts/enable-mfa.mjs` (Admin SDK `projectConfigManager().updateProjectConfig`) turns TOTP on.

**Code**
- `AuthService`:
  - `login()` and `completeSignInLink()` catch `auth/multi-factor-auth-required` → "code needed" state
    (`getMultiFactorResolver`);
  - `verifyOtp(code)` → `TotpMultiFactorGenerator.assertionForSignIn` → `resolver.resolveSignIn`;
  - enrollment: generate secret + QR URL, confirm the first code, list/unenroll factors.
- Login and finish pages: 6-digit code step with "Wrong code" error and Cancel. Restored sessions never ask again.
- Security page: "Set up authenticator app" (QR code plus a copyable key, confirm with a code), Remove, status label.
  Needs a small QR library or component.
- Staff/admin without a second factor are redirected to their account page until they enroll.

**Rules**
- Staff/admin checks (`isStaff`, `isAdmin`, `isStaffOrAdmin`) also require a second-factor sign-in. Expected token
  field: `request.auth.token.firebase.sign_in_second_factor`; **confirm in testing before deploying.**
- Rollout: app first → staff and admins enroll → deploy the rule.

**Recovery**
- `scripts/reset-mfa.mjs <email>`: admin clears a lost device.
- Written emergency steps for when the last admin loses their phone (service-account key + Console).

**Testing:** enroll; sign in with a code; wrong code; remove; staff forced to enroll; the rule blocks a
password-only staff session; reset script.

**Effort:** large.

## Phase 4 (optional): SMS OTP for customers

*Only if customers want text-message codes. Charged per SMS and open to SMS abuse.*

**Console**
- SMS region policy: allow the Philippines only.
- Enable phone as a second factor.
- Up to 10 test phone numbers.
- Budget alert in Google Cloud Billing.

**Code**
- Login: invisible reCAPTCHA (required by Firebase); "SMS code" at the code step; choose SMS or app when both are
  enrolled.
- Security page: "Add phone number" with code confirmation, reusing the existing Philippine mobile validator.

**Protection:** Firebase's per-number limits; SMS only as a second step, never a standalone sign-in.

**Testing:** test numbers, one real number, region block.

**Effort:** medium.

## Phase 5: Documents and release

**Privacy Policy**
- Collected data: email verification status; OTP enrollment (authenticator secret held by Google; phone number if SMS).
- Data Protection and Security: list only what is now actually in place.
- Cookies and Local Storage: the email kept in the browser during link sign-in.

**Terms of Service:** Account Security section covers password reset, email links and OTP.

**Versions:** bump `TERMS_VERSION` / `PRIVACY_VERSION`. Optional: prompt existing users to accept the new versions
(not built yet; small).

**Project notes**
- `CLAUDE.md`: remove the outdated "needs Blaze" notes; describe the new auth flows.
- IOTEL Assistant: check its account-related answers are still true.

**Release order** (verify each step before the next):
Phase 1 app → Phase 1 rules → Phase 2 → Phase 3 app → staff/admins enroll → Phase 3 rules → Phase 4 → Phase 5 documents.

---

## Risks

| Risk | Mitigation |
|---|---|
| Email-link sign-in removes an unverified password | Phase 1 first; "Forgot password" restores it |
| Staff locked out after the OTP rule | Deploy the rule only after everyone enrolled; reset script ready |
| Rules don't see a fresh verification right away | Force-refresh the ID token after verifying |
| SMS costs and abuse (Phase 4) | Philippines only, second step only, budget alert |
| Emails land in spam | Custom sender domain (Phase 0) |

## Open items

1. Phase 0 Console steps (the owner does them, or approves the scriptable parts).
2. Confirm the assumed choices above.
3. Production web domain, for authorized domains and link URLs.

## References

- [Email link authentication (web)](https://firebase.google.com/docs/auth/web/email-link-auth)
- [TOTP MFA (web)](https://firebase.google.com/docs/auth/web/totp-mfa)
- [SMS MFA (web)](https://firebase.google.com/docs/auth/web/multi-factor)
- [Phone auth (web)](https://firebase.google.com/docs/auth/web/phone-auth)
- [Auth limits](https://firebase.google.com/docs/auth/limits)
- [Firebase pricing](https://firebase.google.com/pricing)

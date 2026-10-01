/**
 * Two-step sign-in (emailed code for customers, authenticator app for staff/admins; see docs/auth-upgrade-plan.md).
 * `false`: email + password alone signs everyone in. `true`: the second step is required.
 *
 * Mirrored in `twoStepSignIn()` in firestore.rules and `TWO_STEP_SIGN_IN` in functions/src/flags.ts, which enforce
 * it on the server; change all three together (then deploy rules and functions).
 */
export const TWO_STEP_SIGN_IN = false;

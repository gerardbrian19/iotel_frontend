/**
 * Two-step sign-in. Mirrors `TWO_STEP_SIGN_IN` in src/app/core/auth/auth-flags.ts and `twoStepSignIn()` in
 * firestore.rules; change all three together. `false`: a password-only session counts as signed in.
 */
export const TWO_STEP_SIGN_IN = false;

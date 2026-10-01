import { FirebaseError } from 'firebase/app';

/** Error whose message is safe and meant to be shown to the user as-is. */
export class AppAuthError extends Error {}

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Invalid email or password. Please try again.',
  'auth/invalid-login-credentials': 'Invalid email or password. Please try again.',
  'auth/wrong-password': 'Invalid email or password. Please try again.',
  'auth/user-not-found': 'Invalid email or password. Please try again.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled. Please contact an administrator.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password':
    'That password is too weak. Use at least 8 characters with a letter and a number.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/operation-not-allowed': 'Email/password sign-in is not enabled for this Firebase project.',
  'auth/invalid-verification-code':
    'That code is incorrect. Check your authenticator app and try again.',
  'auth/totp-challenge-timeout': 'That took too long. Please sign in again.',
  'auth/requires-recent-login': 'For your security, please sign out and sign in again, then retry.',
  'auth/unverified-email': 'Verify your email with the emailed code first.',
  'auth/maximum-second-factor-count-exceeded':
    'An authenticator app is already set up for this account.',
  'auth/expired-action-code': 'This link has expired. Please request a new one.',
  'auth/invalid-action-code':
    'This link is invalid or has already been used. Please request a new one.',
  'auth/missing-password': 'Please enter your password.',
  'permission-denied':
    'You do not have permission to do that (check that the Firestore rules are deployed).',
  unavailable: 'The service is temporarily unavailable. Please try again.',
};

/** Cloud Function errors whose messages are written for users in functions/src/index.ts. */
const USER_FACING_FUNCTION_CODES = new Set([
  'functions/invalid-argument',
  'functions/failed-precondition',
  'functions/deadline-exceeded',
  'functions/resource-exhausted',
  'functions/permission-denied',
  'functions/unavailable',
  'functions/not-found',
  'functions/unauthenticated',
]);

export function authErrorMessage(err: unknown): string {
  if (err instanceof AppAuthError) return err.message;
  if (err instanceof FirebaseError) {
    if (USER_FACING_FUNCTION_CODES.has(err.code) && err.message) {
      // The SDK can append the HTTP status, e.g. "That code is incorrect. [403]".
      return err.message.replace(/\s*\[\d+\]$/, '');
    }
    return (
      MESSAGES[err.code] ??
      MESSAGES[err.code.replace(/^firestore\//, '')] ??
      'Something went wrong. Please try again.'
    );
  }
  return 'Something went wrong. Please try again.';
}

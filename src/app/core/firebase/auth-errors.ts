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
  'permission-denied':
    'You do not have permission to do that (check that the Firestore rules are deployed).',
  unavailable: 'The service is temporarily unavailable. Please try again.',
};

export function authErrorMessage(err: unknown): string {
  if (err instanceof AppAuthError) return err.message;
  if (err instanceof FirebaseError) {
    return (
      MESSAGES[err.code] ??
      MESSAGES[err.code.replace(/^firestore\//, '')] ??
      'Something went wrong. Please try again.'
    );
  }
  return 'Something went wrong. Please try again.';
}

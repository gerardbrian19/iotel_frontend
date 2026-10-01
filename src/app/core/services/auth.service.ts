import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FirebaseError } from 'firebase/app';
import {
  EmailAuthProvider,
  User as FirebaseUser,
  MultiFactorError,
  MultiFactorResolver,
  TotpMultiFactorGenerator,
  TotpSecret,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  getMultiFactorResolver,
  multiFactor,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  verifyPasswordResetCode,
} from 'firebase/auth';
import {
  DocumentData,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { AppAuthError, authErrorMessage } from '../firebase/auth-errors';
import { FIREBASE_AUTH, FIRESTORE, FUNCTIONS } from '../firebase/firebase';
import { PRIVACY_VERSION, TERMS_VERSION } from '../legal/legal-documents';
import { USER_ROLES, User, UserRole } from '../models';

export function toUser(id: string, data: DocumentData): User {
  const role = data['role'];
  if (!USER_ROLES.includes(role)) {
    throw new AppAuthError('Your account has no valid role. Please contact an administrator.');
  }
  const createdAt = data['createdAt'];
  const photoURL = data['photoURL'];
  return {
    id,
    name: String(data['name'] ?? data['email'] ?? ''),
    email: String(data['email'] ?? ''),
    role,
    photoURL: typeof photoURL === 'string' && photoURL ? photoURL : undefined,
    createdAt: createdAt instanceof Timestamp ? createdAt.toDate().toISOString() : undefined,
  };
}

/**
 * The second step still owed after the password:
 * - `email-code`: a 6-digit code emailed by the `sendLoginCode` function (customers; staff/admins whose email isn't
 *   verified yet, before they set up an authenticator);
 * - `totp-code`: the code from the authenticator app (staff/admins, and anyone else who enrolled one);
 * - `totp-enroll`: staff/admins without an authenticator app must set one up.
 */
export type SignInStep = 'none' | 'email-code' | 'totp-code' | 'totp-enroll';

export interface TotpSetup {
  /** Base32 key for typing into the app by hand. */
  secretKey: string;
  /** `otpauth://` URL, shown as a QR code. */
  qrUrl: string;
}

/** Thrown by `changePassword` when the account uses an authenticator app and no code was given yet. */
export class SecondFactorRequiredError extends AppAuthError {
  constructor() {
    super('Enter the 6-digit code from your authenticator app to confirm.');
  }
}

const TOTP = TotpMultiFactorGenerator.FACTOR_ID;

function isMultiFactorRequired(err: unknown): err is MultiFactorError {
  return err instanceof FirebaseError && err.code === 'auth/multi-factor-auth-required';
}

/**
 * Firebase Authentication + the `users/{uid}` profile document that holds each account's role.
 * Sign-up always yields the `customer` role; only admins can create staff/admin accounts or change roles
 * (enforced by firestore.rules, see UserService).
 *
 * A password alone never signs anyone in: `currentUser` is published only once the second step is done (emailed code
 * for customers, authenticator app for staff/admins), and firestore.rules check the same thing on the ID token.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly db = inject(FIRESTORE);
  private readonly functions = inject(FUNCTIONS);
  private readonly router = inject(Router);

  private readonly _currentUser = signal<User | null>(null);
  readonly currentUser = this._currentUser.asReadonly();
  readonly isLoggedIn = computed(() => this._currentUser() !== null);

  private readonly _pendingStep = signal<SignInStep>('none');
  readonly pendingStep = this._pendingStep.asReadonly();
  /** Email of the account part-way through signing in, for "We sent a code to j•••@gmail.com". */
  private readonly _pendingEmail = signal<string | null>(null);
  readonly pendingEmail = this._pendingEmail.asReadonly();
  /** Why the last code email couldn't be sent, if it failed. */
  private readonly _codeSendError = signal<string | null>(null);
  readonly codeSendError = this._codeSendError.asReadonly();
  /** Epoch ms after which another code may be requested. */
  private readonly _resendAt = signal(0);
  readonly resendAt = this._resendAt.asReadonly();
  /** True when the emailed code only confirms a staff/admin email before the authenticator setup. */
  private readonly _setupAfterCode = signal(false);
  readonly setupAfterCode = this._setupAfterCode.asReadonly();
  /** Why a half-finished sign-in was dropped, for the login page. */
  private readonly _signInError = signal<string | null>(null);
  readonly signInError = this._signInError.asReadonly();
  /** One-off message for the login page, e.g. after a password change. */
  private readonly _notice = signal<string | null>(null);
  readonly notice = this._notice.asReadonly();

  private pendingProfile: User | null = null;
  private resolver: MultiFactorResolver | null = null;
  private totpSecret: TotpSecret | null = null;
  /** True while login()/register() run: they publish the user themselves once the second step is done. */
  private signingIn = false;

  /** Bumped on every auth event; lets slower, stale profile loads be discarded. */
  private version = 0;

  /** Resolves once a persisted session (if any) has been restored. Awaited at app start so guards can stay synchronous. */
  readonly ready: Promise<void> = new Promise((resolve) => {
    onAuthStateChanged(this.auth, async (fbUser) => {
      if (this.signingIn) {
        // Signed out (or into another account) from another tab while this one waits for the second step.
        const pendingId = this.pendingProfile?.id;
        if (pendingId && fbUser?.uid !== pendingId) void this.expireSignIn();
        resolve();
        return;
      }
      const version = ++this.version;
      try {
        const user = fbUser ? await this.restore(fbUser) : null;
        if (version === this.version) this._currentUser.set(user);
      } catch (err) {
        console.error('Could not restore session', err);
        if (version === this.version) this._currentUser.set(null);
      }
      resolve();
    });
  });

  hasRole(role: UserRole): boolean {
    return this._currentUser()?.role === role;
  }

  /** Checks the password, then moves to the second step (`pendingStep`). Never publishes the user by itself. */
  async login(email: string, password: string): Promise<void> {
    this.resetPending();
    this._notice.set(null);
    this._signInError.set(null);
    this.signingIn = true;
    try {
      let fbUser: FirebaseUser;
      try {
        fbUser = (await signInWithEmailAndPassword(this.auth, email.trim(), password)).user;
      } catch (err) {
        if (!isMultiFactorRequired(err)) throw err;
        this.resolver = getMultiFactorResolver(this.auth, err);
        if (!this.resolver.hints.some((h) => h.factorId === TOTP)) {
          throw new AppAuthError(
            'This account uses a sign-in method the app does not support. Please contact an administrator.',
          );
        }
        this._pendingEmail.set(email.trim());
        this._pendingStep.set('totp-code');
        return;
      }
      const profile =
        (await this.readProfile(fbUser.uid)) ??
        (await this.createProfile(fbUser, this.fallbackName(fbUser)));
      await this.beginSecondStep(fbUser, profile);
    } catch (err) {
      await this.abandonSignIn();
      throw err;
    }
  }

  /**
   * Public sign-up. The role is always `customer`. Only call it once the user has accepted the Terms of Service and
   * acknowledged the Privacy Policy: the current versions of both are recorded on the new profile.
   * Continues to the emailed-code step like `login`.
   */
  async register(name: string, email: string, password: string): Promise<void> {
    const cleanName = name.trim().replace(/\s+/g, ' ');
    this.resetPending();
    this._notice.set(null);
    this._signInError.set(null);
    this.signingIn = true;
    try {
      const { user: fbUser } = await createUserWithEmailAndPassword(
        this.auth,
        email.trim(),
        password,
      );
      await updateProfile(fbUser, { displayName: cleanName });
      // If this fails, the Auth account exists without a profile; the next sign-in creates the customer profile.
      const profile = await this.createProfile(fbUser, cleanName, true);
      await this.beginSecondStep(fbUser, profile);
    } catch (err) {
      await this.abandonSignIn();
      throw err;
    }
  }

  /** Emails a new code for the sign-in in progress. Failures land in `codeSendError` rather than throwing. */
  async sendEmailCode(): Promise<void> {
    this._codeSendError.set(null);
    try {
      const res = await httpsCallable<void, { resendAfterSeconds: number }>(
        this.functions,
        'sendLoginCode',
      )();
      this._resendAt.set(Date.now() + res.data.resendAfterSeconds * 1000);
    } catch (err) {
      // A cooldown refusal carries the wait in the callable error's `details`.
      const seconds = (err as { details?: { retryAfterSeconds?: number } }).details
        ?.retryAfterSeconds;
      if (seconds) this._resendAt.set(Date.now() + seconds * 1000);
      this._codeSendError.set(authErrorMessage(err));
    }
  }

  async verifyEmailCode(code: string): Promise<void> {
    const fbUser = this.auth.currentUser;
    const profile = this.pendingProfile;
    if (!fbUser || !profile || this._pendingStep() !== 'email-code') {
      await this.expireSignIn();
      return;
    }
    await httpsCallable<{ code: string }, { ok: boolean }>(
      this.functions,
      'verifyLoginCode',
    )({ code });
    // Pick up the `otpAuthTime` claim (and emailVerified) the function just set.
    await fbUser.getIdToken(true);
    if (profile.role === 'customer') {
      this.finishSignIn(profile);
      return;
    }
    await fbUser.reload();
    this._pendingStep.set('totp-enroll');
  }

  async verifyTotp(code: string): Promise<void> {
    const resolver = this.resolver;
    if (!resolver || this._pendingStep() !== 'totp-code') {
      await this.expireSignIn();
      return;
    }
    const { user: fbUser } = await resolver.resolveSignIn(this.totpAssertion(resolver, code));
    const profile = await this.readProfile(fbUser.uid);
    if (!profile) {
      await this.abandonSignIn();
      throw new AppAuthError('Your account has no profile. Please contact an administrator.');
    }
    this.finishSignIn(profile);
  }

  /** First half of setting up an authenticator app for the signed-in (or signing-in) account. */
  async startTotpEnrollment(): Promise<TotpSetup> {
    const fbUser = this.auth.currentUser;
    if (!fbUser) throw new AppAuthError('Please sign in again.');
    try {
      const session = await multiFactor(fbUser).getSession();
      this.totpSecret = await TotpMultiFactorGenerator.generateSecret(session);
    } catch (err) {
      if (err instanceof FirebaseError && err.code === 'auth/operation-not-allowed') {
        throw new AppAuthError(
          "Authenticator apps aren't switched on for IOTEL yet. Please contact the administrator.",
        );
      }
      throw err;
    }
    return {
      secretKey: this.totpSecret.secretKey,
      qrUrl: this.totpSecret.generateQrCodeUrl(fbUser.email ?? 'IOTEL account', 'IOTEL'),
    };
  }

  /**
   * Confirms the authenticator app with its first code. The current session wasn't signed in with it, so the user is
   * signed out and asked to sign in again with the app.
   */
  async finishTotpEnrollment(code: string): Promise<void> {
    const fbUser = this.auth.currentUser;
    if (!fbUser || !this.totpSecret) throw new AppAuthError('Please start the setup again.');
    const assertion = TotpMultiFactorGenerator.assertionForEnrollment(this.totpSecret, code.trim());
    await multiFactor(fbUser).enroll(assertion, 'Authenticator app');
    this.totpSecret = null;
    await this.abandonSignIn();
    this._notice.set('Authenticator app set up. Sign in again and enter the code from the app.');
  }

  /** Whether the signed-in account has an authenticator app, and since when (ISO). */
  authenticatorInfo(): { enrolled: boolean; enrolledAt?: string } {
    const factor = this.auth.currentUser
      ? multiFactor(this.auth.currentUser).enrolledFactors.find((f) => f.factorId === TOTP)
      : undefined;
    return factor
      ? { enrolled: true, enrolledAt: new Date(factor.enrollmentTime).toISOString() }
      : { enrolled: false };
  }

  /** Removes the authenticator app and signs out; the next sign-in asks for a new one to be set up. */
  async removeAuthenticator(): Promise<void> {
    const fbUser = this.auth.currentUser;
    const factor = fbUser
      ? multiFactor(fbUser).enrolledFactors.find((f) => f.factorId === TOTP)
      : undefined;
    if (!fbUser || !factor) return;
    try {
      await multiFactor(fbUser).unenroll(factor);
    } catch (err) {
      // Removing the factor the session was signed in with can end the session; that's fine here.
      if (!(err instanceof FirebaseError && err.code === 'auth/user-token-expired')) throw err;
    }
    await this.logout();
    this._notice.set('Authenticator app removed. Sign in again to set up the new one.');
  }

  /** Signs out of a half-finished sign-in (the user pressed Cancel on the code step). */
  async cancelPendingLogin(): Promise<void> {
    await this.abandonSignIn();
  }

  clearNotice(): void {
    this._notice.set(null);
  }

  async logout(): Promise<void> {
    this.resetPending();
    this.signingIn = false;
    await signOut(this.auth);
    this.setUser(null);
    await this.router.navigate(['/auth/login']);
  }

  /**
   * Changes the signed-in user's password after re-checking the current one (and the authenticator code for accounts
   * that have one; throws `SecondFactorRequiredError` until it's given). Signs out afterwards: re-authenticating
   * starts a new sign-in, which needs its second step again.
   */
  async changePassword(current: string, next: string, totpCode?: string): Promise<void> {
    const fbUser = this.auth.currentUser;
    if (!fbUser?.email) throw new AppAuthError('Please sign in again.');
    try {
      await reauthenticateWithCredential(
        fbUser,
        EmailAuthProvider.credential(fbUser.email, current),
      );
    } catch (err) {
      if (!isMultiFactorRequired(err)) throw err;
      if (!totpCode) throw new SecondFactorRequiredError();
      const resolver = getMultiFactorResolver(this.auth, err);
      await resolver.resolveSignIn(this.totpAssertion(resolver, totpCode));
    }
    await updatePassword(fbUser, next);
    await this.logout();
    this._notice.set('Password changed. Please sign in with your new password.');
  }

  /**
   * Sends Firebase's password-reset email. Resolves the same way whether or not the email has an account (email
   * enumeration protection is on, so Firebase doesn't say either).
   */
  async sendPasswordReset(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(this.auth, email.trim(), {
        url: `${window.location.origin}/auth/login`,
      });
    } catch (err) {
      if (err instanceof FirebaseError && err.code === 'auth/user-not-found') return;
      throw err;
    }
  }

  /** Checks a reset link's code; returns the account's email. */
  checkResetCode(oobCode: string): Promise<string> {
    return verifyPasswordResetCode(this.auth, oobCode);
  }

  async confirmReset(oobCode: string, newPassword: string): Promise<void> {
    await confirmPasswordReset(this.auth, oobCode, newPassword);
    this._notice.set('Password changed. Please sign in with your new password.');
  }

  /** Saves (or, with `null`, removes) the signed-in user's profile picture on their `users/{uid}` document. */
  async setPhoto(photoURL: string | null): Promise<void> {
    const user = this._currentUser();
    if (!user) throw new Error('You need to be signed in to change your profile picture.');
    await updateDoc(doc(this.db, 'users', user.id), {
      photoURL: photoURL ?? deleteField(),
    });
    // Ignore the result if the account changed while the write was in flight.
    if (this._currentUser()?.id === user.id) {
      this._currentUser.set({ ...user, photoURL: photoURL ?? undefined });
    }
  }

  /** A restored session counts only if its token shows the second step (mirrors `secondStep()` in firestore.rules). */
  private async restore(fbUser: FirebaseUser): Promise<User | null> {
    const profile = await this.readProfile(fbUser.uid);
    // A password-only session (code step never finished, e.g. the tab was closed on it) counts as signed out.
    // It isn't signed out here: the session is shared by every tab, and another tab may be on its code step.
    return profile && (await this.secondStepDone(fbUser, profile.role)) ? profile : null;
  }

  private async secondStepDone(fbUser: FirebaseUser, role: UserRole): Promise<boolean> {
    const { claims, signInSecondFactor } = await fbUser.getIdTokenResult();
    if (signInSecondFactor === TOTP) return true;
    return role === 'customer' && claims['otpAuthTime'] === claims['auth_time'];
  }

  private async beginSecondStep(fbUser: FirebaseUser, profile: User): Promise<void> {
    this.pendingProfile = profile;
    this._pendingEmail.set(fbUser.email);
    if (profile.role === 'customer' || !fbUser.emailVerified) {
      // Firebase only lets verified emails set up an authenticator app, so staff/admins confirm theirs first (once).
      this._setupAfterCode.set(profile.role !== 'customer');
      this._pendingStep.set('email-code');
      await this.sendEmailCode();
    } else {
      this._pendingStep.set('totp-enroll');
    }
  }

  private totpAssertion(resolver: MultiFactorResolver, code: string) {
    const hint = resolver.hints.find((h) => h.factorId === TOTP);
    if (!hint) throw new AppAuthError('No authenticator app is set up for this account.');
    return TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.trim());
  }

  private finishSignIn(profile: User): void {
    this.resetPending();
    this.signingIn = false;
    this.setUser(profile);
  }

  private async expireSignIn(): Promise<void> {
    await this.abandonSignIn();
    this._signInError.set(
      'Your sign-in was interrupted (for example, by signing in or out in another tab). Please sign in again.',
    );
  }

  private async abandonSignIn(): Promise<void> {
    this.resetPending();
    this.signingIn = false;
    if (this.auth.currentUser) await signOut(this.auth).catch(() => undefined);
    this.setUser(null);
  }

  private resetPending(): void {
    this._pendingStep.set('none');
    this._pendingEmail.set(null);
    this._setupAfterCode.set(false);
    this._codeSendError.set(null);
    this._resendAt.set(0);
    this.pendingProfile = null;
    this.resolver = null;
    this.totpSecret = null;
  }

  private setUser(user: User | null): void {
    this.version++;
    this._currentUser.set(user);
  }

  private async readProfile(uid: string): Promise<User | null> {
    const snap = await getDoc(doc(this.db, 'users', uid));
    return snap.exists() ? toUser(uid, snap.data()) : null;
  }

  /** `acceptedLegal` records which Terms / Privacy Policy versions the user agreed to at sign-up, and when. */
  private async createProfile(
    fbUser: FirebaseUser,
    name: string,
    acceptedLegal = false,
  ): Promise<User> {
    const email = fbUser.email ?? '';
    await setDoc(doc(this.db, 'users', fbUser.uid), {
      name,
      email,
      role: 'customer',
      createdAt: serverTimestamp(),
      ...(acceptedLegal && {
        legalAcceptance: {
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
          acceptedAt: serverTimestamp(),
        },
      }),
    });
    return { id: fbUser.uid, name, email, role: 'customer', createdAt: new Date().toISOString() };
  }

  private fallbackName(fbUser: FirebaseUser): string {
    return fbUser.displayName || fbUser.email?.split('@')[0] || 'Customer';
  }
}

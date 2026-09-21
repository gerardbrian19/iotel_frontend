import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
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
import { AppAuthError } from '../firebase/auth-errors';
import { FIREBASE_AUTH, FIRESTORE } from '../firebase/firebase';
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
 * Firebase Authentication + the `users/{uid}` profile document that holds each account's role.
 * Sign-up always yields the `customer` role; only admins can create staff/admin accounts or change roles
 * (enforced by firestore.rules, see UserService).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly db = inject(FIRESTORE);
  private readonly router = inject(Router);

  private readonly _currentUser = signal<User | null>(null);
  readonly currentUser = this._currentUser.asReadonly();
  readonly isLoggedIn = computed(() => this._currentUser() !== null);

  /** Bumped on every auth event; lets slower, stale profile loads be discarded. */
  private version = 0;

  /** Resolves once a persisted session (if any) has been restored. Awaited at app start so guards can stay synchronous. */
  readonly ready: Promise<void> = new Promise((resolve) => {
    onAuthStateChanged(this.auth, async (fbUser) => {
      const version = ++this.version;
      try {
        const user = fbUser ? await this.readProfile(fbUser.uid) : null;
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

  async login(email: string, password: string): Promise<User> {
    const { user: fbUser } = await signInWithEmailAndPassword(this.auth, email.trim(), password);
    try {
      const user =
        (await this.readProfile(fbUser.uid)) ??
        (await this.createProfile(fbUser, this.fallbackName(fbUser)));
      this.setUser(user);
      return user;
    } catch (err) {
      await signOut(this.auth);
      throw err;
    }
  }

  /** Public sign-up. The role is always `customer`. */
  async register(name: string, email: string, password: string): Promise<User> {
    const cleanName = name.trim().replace(/\s+/g, ' ');
    const { user: fbUser } = await createUserWithEmailAndPassword(
      this.auth,
      email.trim(),
      password,
    );
    try {
      await updateProfile(fbUser, { displayName: cleanName });
      const user = await this.createProfile(fbUser, cleanName);
      this.setUser(user);
      return user;
    } catch (err) {
      // The Auth account exists but has no profile; the next sign-in creates the customer profile.
      await signOut(this.auth);
      throw err;
    }
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
    this.setUser(null);
    await this.router.navigate(['/auth/login']);
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

  private setUser(user: User | null): void {
    this.version++;
    this._currentUser.set(user);
  }

  private async readProfile(uid: string): Promise<User | null> {
    const snap = await getDoc(doc(this.db, 'users', uid));
    return snap.exists() ? toUser(uid, snap.data()) : null;
  }

  private async createProfile(fbUser: FirebaseUser, name: string): Promise<User> {
    const email = fbUser.email ?? '';
    await setDoc(doc(this.db, 'users', fbUser.uid), {
      name,
      email,
      role: 'customer',
      createdAt: serverTimestamp(),
    });
    return { id: fbUser.uid, name, email, role: 'customer', createdAt: new Date().toISOString() };
  }

  private fallbackName(fbUser: FirebaseUser): string {
    return fbUser.displayName || fbUser.email?.split('@')[0] || 'Customer';
  }
}

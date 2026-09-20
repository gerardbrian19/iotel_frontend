import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut, updateProfile } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { AppAuthError } from '../firebase/auth-errors';
import { FIREBASE_APP, FIRESTORE, useAuthEmulatorIfEnabled } from '../firebase/firebase';
import { User, UserRole } from '../models';
import { toUser } from './auth.service';

export interface NewAccount {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

/** Admin-only account management (see the `users` rules in firestore.rules). */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly app = inject(FIREBASE_APP);
  private readonly db = inject(FIRESTORE);

  private readonly _users = signal<User[]>([]);
  readonly users = this._users.asReadonly();
  readonly loadError = signal<string | null>(null);

  /** Live-subscribes to all user profiles until the caller's lifecycle ends. Must run in an injection context. */
  watchUsers(destroyRef = inject(DestroyRef)): void {
    const stop = onSnapshot(
      collection(this.db, 'users'),
      (snap) => {
        this.loadError.set(null);
        const list: User[] = [];
        snap.forEach((d) => {
          try {
            list.push(toUser(d.id, d.data()));
          } catch {
            // Skip profiles without a valid role; they cannot sign in anyway.
          }
        });
        this._users.set(list.sort((a, b) => a.name.localeCompare(b.name)));
      },
      () =>
        this.loadError.set('Could not load users. Check your permissions and the Firestore rules.'),
    );
    destroyRef.onDestroy(stop);
  }

  updateRole(uid: string, role: UserRole): Promise<void> {
    return updateDoc(doc(this.db, 'users', uid), { role });
  }

  /**
   * Creates an Auth account plus its profile with the given role. The account is created on a throwaway secondary
   * Firebase app because creating a user on the main app would sign the admin out and in as the new user.
   */
  async createAccount({ name, email, password, role }: NewAccount): Promise<void> {
    const cleanName = name.trim().replace(/\s+/g, ' ');
    const secondary = initializeApp(this.app.options, `account-creator-${Date.now()}`);
    const secondaryAuth = useAuthEmulatorIfEnabled(getAuth(secondary));
    try {
      const { user } = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
      await updateProfile(user, { displayName: cleanName });
      try {
        await setDoc(doc(this.db, 'users', user.uid), {
          name: cleanName,
          email: user.email,
          role,
          createdAt: serverTimestamp(),
        });
      } catch {
        throw new AppAuthError(
          'The login was created but its profile could not be saved. Have them sign in once, then set their role here.',
        );
      }
    } finally {
      await signOut(secondaryAuth).catch(() => undefined);
      await deleteApp(secondary).catch(() => undefined);
    }
  }
}

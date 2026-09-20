import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { Observable, from, map } from 'rxjs';
import { FIRESTORE } from '../firebase/firebase';
import { AuthService } from './auth.service';

/**
 * A customer's liked products, stored as `users/{uid}/favorites/{productId}` so they follow the account
 * across devices. Only customers subscribe; the set is empty for everyone else and after sign-out.
 */
@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);

  private readonly _ids = signal<ReadonlySet<string>>(new Set());
  readonly ids = this._ids.asReadonly();
  readonly count = computed(() => this._ids().size);

  private readonly uid = computed(() => {
    const user = this.auth.currentUser();
    return user?.role === 'customer' ? user.id : null;
  });

  constructor() {
    effect(onCleanup => {
      const uid = this.uid();
      untracked(() => this._ids.set(new Set()));
      if (!uid) return;

      const unsubscribe = onSnapshot(
        collection(this.db, 'users', uid, 'favorites'),
        snapshot => this._ids.set(new Set(snapshot.docs.map(d => d.id))),
        err => console.error('Could not load favorites', err),
      );
      onCleanup(unsubscribe);
    });
  }

  /** Likes or unlikes a product. Emits whether it is now a favorite. Updates locally right away, before the server confirms. */
  toggle(productId: string): Observable<boolean> {
    const uid = this.uid();
    if (!uid) return from(Promise.reject(new Error('Sign in as a customer to save favorites.')));

    const ref = doc(this.db, 'users', uid, 'favorites', productId);
    const liked = !this._ids().has(productId);
    const write = liked ? setDoc(ref, { createdAt: serverTimestamp() }) : deleteDoc(ref);
    return from(write).pipe(map(() => liked));
  }
}

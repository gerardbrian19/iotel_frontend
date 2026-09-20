import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  DocumentData,
  QueryDocumentSnapshot,
  Timestamp,
  WriteBatch,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { Observable, from } from 'rxjs';
import { FIRESTORE } from '../firebase/firebase';
import { Address, ShippingAddress } from '../models';
import { AuthService } from './auth.service';

function toAddress(snap: QueryDocumentSnapshot<DocumentData>): Address {
  // `estimate` gives a pending local write a provisional createdAt instead of null, so ordering doesn't jump.
  const data = snap.data({ serverTimestamps: 'estimate' });
  const createdAt = data['createdAt'];
  return {
    id: snap.id,
    fullName: data['fullName'] ?? '',
    addressLine: data['addressLine'] ?? '',
    city: data['city'] ?? '',
    province: data['province'] ?? '',
    zip: data['zip'] ?? '',
    mobile: data['mobile'] ?? '',
    isDefault: data['isDefault'] === true,
    createdAt: createdAt instanceof Timestamp ? createdAt.toDate().toISOString() : undefined,
  };
}

/** Trims every field and strips spaces/dashes from the mobile number so stored values are uniform. */
function normalize(input: ShippingAddress): ShippingAddress {
  return {
    fullName: input.fullName.trim(),
    addressLine: input.addressLine.trim(),
    city: input.city.trim(),
    province: input.province.trim(),
    zip: input.zip.trim(),
    mobile: input.mobile.replace(/[\s-]/g, ''),
  };
}

/**
 * A customer's saved shipping addresses, stored as `users/{uid}/addresses/{id}` so they follow the account
 * across devices. Only customers subscribe; the list is empty for everyone else and after sign-out.
 *
 * At most one address is the default (`isDefault`). Every write that moves the default runs in a single
 * batch, so the list never shows two defaults or none while it has addresses. The first address a customer
 * adds, and the next-oldest one when the default is deleted, become the default automatically.
 */
@Injectable({ providedIn: 'root' })
export class AddressService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);

  private readonly _addresses = signal<Address[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal(false);

  /** Default address first, then oldest to newest. */
  readonly addresses = this._addresses.asReadonly();
  /** True until the first snapshot (or error) arrives for the signed-in customer. */
  readonly loading = this._loading.asReadonly();
  /** True when the list could not be loaded. */
  readonly error = this._error.asReadonly();
  readonly defaultAddress = computed(() => this._addresses().find(a => a.isDefault) ?? null);

  private readonly uid = computed(() => {
    const user = this.auth.currentUser();
    return user?.role === 'customer' ? user.id : null;
  });

  constructor() {
    effect(onCleanup => {
      const uid = this.uid();
      untracked(() => {
        this._addresses.set([]);
        this._error.set(false);
        this._loading.set(uid !== null);
      });
      if (!uid) return;

      const unsubscribe = onSnapshot(
        collection(this.db, 'users', uid, 'addresses'),
        snapshot => {
          const list = snapshot.docs
            .map(toAddress)
            .sort(
              (a, b) =>
                Number(b.isDefault) - Number(a.isDefault) ||
                (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
            );
          this._addresses.set(list);
          this._error.set(false);
          this._loading.set(false);
        },
        err => {
          console.error('Could not load addresses', err);
          this._error.set(true);
          this._loading.set(false);
        },
      );
      onCleanup(unsubscribe);
    });
  }

  /** Saves a new address. It becomes the default if `makeDefault` is set or it is the customer's first. */
  add(input: ShippingAddress, makeDefault: boolean): Observable<void> {
    return this.commit(batch => {
      const uid = this.requireUid();
      const ref = doc(collection(this.db, 'users', uid, 'addresses'));
      const isDefault = makeDefault || this._addresses().length === 0;
      batch.set(ref, { ...normalize(input), isDefault, createdAt: serverTimestamp() });
      if (isDefault) this.demoteOthers(batch, uid, ref.id);
    });
  }

  /** Updates an address's details. `makeDefault` can promote it but never demotes it: pick another as default for that. */
  update(id: string, input: ShippingAddress, makeDefault: boolean): Observable<void> {
    return this.commit(batch => {
      const uid = this.requireUid();
      batch.update(doc(this.db, 'users', uid, 'addresses', id), {
        ...normalize(input),
        ...(makeDefault ? { isDefault: true } : {}),
      });
      if (makeDefault) this.demoteOthers(batch, uid, id);
    });
  }

  setDefault(id: string): Observable<void> {
    return this.commit(batch => {
      const uid = this.requireUid();
      batch.update(doc(this.db, 'users', uid, 'addresses', id), { isDefault: true });
      this.demoteOthers(batch, uid, id);
    });
  }

  /** Deletes an address. If it was the default, the oldest remaining address takes over. */
  remove(id: string): Observable<void> {
    return this.commit(batch => {
      const uid = this.requireUid();
      const list = this._addresses();
      batch.delete(doc(this.db, 'users', uid, 'addresses', id));
      if (list.find(a => a.id === id)?.isDefault) {
        const next = list.find(a => a.id !== id);
        if (next)
          batch.update(doc(this.db, 'users', uid, 'addresses', next.id), { isDefault: true });
      }
    });
  }

  private demoteOthers(batch: WriteBatch, uid: string, keepId: string): void {
    for (const a of this._addresses()) {
      if (a.isDefault && a.id !== keepId) {
        batch.update(doc(this.db, 'users', uid, 'addresses', a.id), { isDefault: false });
      }
    }
  }

  private requireUid(): string {
    const uid = this.uid();
    if (!uid) throw new Error('Sign in as a customer to manage addresses.');
    return uid;
  }

  private commit(build: (batch: WriteBatch) => void): Observable<void> {
    try {
      const batch = writeBatch(this.db);
      build(batch);
      return from(batch.commit());
    } catch (err) {
      return from(Promise.reject(err));
    }
  }
}

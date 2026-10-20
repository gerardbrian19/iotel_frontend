import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  DocumentData,
  QueryDocumentSnapshot,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Observable, defer } from 'rxjs';
import { FIREBASE_STORAGE, FIRESTORE } from '../firebase/firebase';
import { dataOf, isoOf } from '../firebase/timestamps';
import { PaymentReceiver, PaymentReceiverInput } from '../models';
import { MAX_QR_BYTES } from '../payments/manual-payments';
import { imageFileError } from '../../shared/utils/proof-image';
import { AuthService } from './auth.service';

const RECEIVERS = 'paymentReceivers';

function toReceiver(snap: QueryDocumentSnapshot<DocumentData>): PaymentReceiver {
  const data = dataOf(snap);
  return {
    id: snap.id,
    type: data['type'] === 'bank' ? 'bank' : 'gcash',
    label: String(data['label'] ?? ''),
    bankName: String(data['bankName'] ?? ''),
    accountName: String(data['accountName'] ?? ''),
    accountNumber: String(data['accountNumber'] ?? ''),
    branch: String(data['branch'] ?? ''),
    qrPath: String(data['qrPath'] ?? ''),
    instructions: String(data['instructions'] ?? ''),
    isActive: data['isActive'] !== false,
    sortOrder: Number(data['sortOrder']) || 0,
    createdAt: isoOf(data['createdAt']),
    updatedAt: isoOf(data['updatedAt']),
  };
}

/** The document written for a receiver (firestore.rules `validReceiver`). */
function toReceiverDocument(input: PaymentReceiverInput): DocumentData {
  const bank = input.type === 'bank';
  return {
    type: input.type,
    label: input.label.trim(),
    bankName: bank ? input.bankName.trim() : '',
    accountName: input.accountName.trim(),
    accountNumber: input.accountNumber.trim(),
    branch: bank ? input.branch.trim() : '',
    qrPath: input.qrPath,
    instructions: input.instructions.trim(),
    isActive: input.isActive,
    sortOrder: Math.max(0, Math.min(999, Math.round(input.sortOrder))),
    updatedAt: serverTimestamp(),
  };
}

/**
 * The accounts customers send GCash / bank transfers to (`paymentReceivers/{id}`), with their QR codes in Storage
 * (`paymentReceivers/{id}/…`). Customers get the active ones, staff and admins all of them; only admins change them
 * (firestore.rules, storage.rules).
 */
@Injectable({ providedIn: 'root' })
export class PaymentReceiverService {
  private readonly db = inject(FIRESTORE);
  private readonly storage = inject(FIREBASE_STORAGE);
  private readonly auth = inject(AuthService);

  private readonly _receivers = signal<PaymentReceiver[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal(false);
  private readonly urls = new Map<string, Promise<string>>();

  /** In `sortOrder`, then by name. */
  readonly receivers = this._receivers.asReadonly();
  readonly activeReceivers = computed(() => this._receivers().filter((r) => r.isActive));
  readonly byId = computed(() => new Map(this._receivers().map((r) => [r.id, r])));
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  private readonly viewer = computed(() => {
    const user = this.auth.currentUser();
    return user ? { id: user.id, role: user.role } : null;
  });

  constructor() {
    effect((onCleanup) => {
      const viewer = this.viewer();
      untracked(() => {
        this._receivers.set([]);
        this._error.set(false);
        this._loading.set(viewer !== null);
      });
      if (!viewer) return;

      const unsubscribe = onSnapshot(
        viewer.role === 'customer'
          ? query(collection(this.db, RECEIVERS), where('isActive', '==', true))
          : collection(this.db, RECEIVERS),
        (snapshot) => {
          this._receivers.set(
            snapshot.docs
              .map(toReceiver)
              .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)),
          );
          this._error.set(false);
          this._loading.set(false);
        },
        (err) => {
          console.error('Could not load payment accounts', err);
          this._error.set(true);
          this._loading.set(false);
        },
      );
      onCleanup(unsubscribe);
    });
  }

  /** A new id, so the QR code can be uploaded under it before the receiver is saved. */
  newId(): string {
    return doc(collection(this.db, RECEIVERS)).id;
  }

  add(id: string, input: PaymentReceiverInput): Observable<void> {
    return defer(() =>
      setDoc(doc(this.db, RECEIVERS, id), {
        ...toReceiverDocument(input),
        createdAt: serverTimestamp(),
      }),
    );
  }

  update(id: string, input: PaymentReceiverInput): Observable<void> {
    return defer(() => updateDoc(doc(this.db, RECEIVERS, id), toReceiverDocument(input)));
  }

  setActive(receiver: PaymentReceiver, isActive: boolean): Observable<void> {
    const { id, createdAt: _c, updatedAt: _u, ...input } = receiver;
    return this.update(id, { ...input, isActive });
  }

  /** Deletes the receiver. Payments keep their own copy of the account, and its QR image is left in Storage. */
  remove(id: string): Observable<void> {
    return defer(async () => {
      if (!(await getDoc(doc(this.db, RECEIVERS, id))).exists()) return;
      await deleteDoc(doc(this.db, RECEIVERS, id));
    });
  }

  /** Admin: uploads a QR code for receiver `id`. Emits its Storage path. */
  uploadQr(id: string, file: File): Observable<string> {
    return defer(async () => {
      const problem = imageFileError(file, MAX_QR_BYTES);
      if (problem) throw new Error(problem);
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${RECEIVERS}/${id}/qr-${Date.now()}.${ext}`;
      await uploadBytes(ref(this.storage, path), file, { contentType: file.type });
      return path;
    });
  }

  /** Download URL of a Storage image (QR code or transfer screenshot), fetched once per path. */
  imageUrl(path: string): Promise<string> {
    let url = this.urls.get(path);
    if (!url) {
      url = getDownloadURL(ref(this.storage, path));
      url.catch(() => this.urls.delete(path));
      this.urls.set(path, url);
    }
    return url;
  }
}

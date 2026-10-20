import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  DocumentData,
  QueryDocumentSnapshot,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase';
import { dataOf, isoOf } from '../firebase/timestamps';
import { ACTIVITY_CATEGORIES, ActivityActorRole, ActivityEntry } from '../models';
import { AuthService } from './auth.service';

const COLLECTION = 'activityLog';
const PAGE = 200;
const CATEGORIES = ACTIVITY_CATEGORIES.map((c) => c.value);
const ROLES: readonly ActivityActorRole[] = ['customer', 'staff', 'admin', 'system'];
const TARGETS: readonly ActivityEntry['targetType'][] = [
  'order',
  'booking',
  'product',
  'service',
  'user',
];

function toEntry(snap: QueryDocumentSnapshot<DocumentData>): ActivityEntry {
  const data = dataOf(snap);
  const amount = data['amount'];
  return {
    id: snap.id,
    at: isoOf(data['at']),
    category: CATEGORIES.includes(data['category']) ? data['category'] : 'account',
    action: String(data['action'] ?? ''),
    summary: String(data['summary'] ?? ''),
    actorId: typeof data['actorId'] === 'string' ? data['actorId'] : null,
    actorName: String(data['actorName'] ?? ''),
    actorRole: ROLES.includes(data['actorRole']) ? data['actorRole'] : 'system',
    targetType: TARGETS.includes(data['targetType']) ? data['targetType'] : 'user',
    targetId: String(data['targetId'] ?? ''),
    targetLabel: String(data['targetLabel'] ?? ''),
    amount: typeof amount === 'number' ? amount : undefined,
  };
}

/**
 * The activity log (`activityLog`, admins only), newest first. The latest entries are streamed while an admin is
 * signed in; `loadMore` widens the window. Entries are written by the Cloud Functions (functions/src/activity.ts),
 * apart from sign-ins, which AuthService records.
 */
@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);

  private readonly _entries = signal<ActivityEntry[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal(false);
  private readonly limit = signal(PAGE);

  readonly entries = this._entries.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  /** True when older entries may exist beyond the loaded window. */
  readonly hasMore = computed(() => this._entries().length >= this.limit());

  private readonly isAdmin = computed(() => this.auth.currentUser()?.role === 'admin');

  constructor() {
    effect((onCleanup) => {
      const admin = this.isAdmin();
      const max = this.limit();
      untracked(() => {
        this._error.set(false);
        this._loading.set(admin);
        if (!admin) {
          this._entries.set([]);
          this.limit.set(PAGE);
        }
      });
      if (!admin) return;

      const unsubscribe = onSnapshot(
        query(collection(this.db, COLLECTION), orderBy('at', 'desc'), limit(max)),
        (snapshot) => {
          this._entries.set(snapshot.docs.map(toEntry));
          this._error.set(false);
          this._loading.set(false);
        },
        (err) => {
          console.error('Could not load the activity log', err);
          this._error.set(true);
          this._loading.set(false);
        },
      );
      onCleanup(unsubscribe);
    });
  }

  /** Loads the next, older page of entries. */
  loadMore(): void {
    this.limit.update((n) => n + PAGE);
  }
}

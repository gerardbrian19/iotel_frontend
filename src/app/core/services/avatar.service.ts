import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { FIRESTORE } from '../firebase/firebase';
import { AuthService } from './auth.service';

/**
 * Profile pictures for chat. `users/{uid}` is private (only the owner and admins read it), so each user also keeps
 * `avatars/{uid}` = { photoURL, updatedAt }, which firestore.rules let staff/admins read for everyone and customers
 * read for staff/admins. This service writes the signed-in user's copy whenever their photo changes (also on sign-in,
 * which fills it in for accounts made before it existed), and loads other people's on demand for `photoOf`.
 */
@Injectable({ providedIn: 'root' })
export class AvatarService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);

  /** uid → photo data URL, or null when they have none or it can't be read. Missing = not loaded yet. */
  private readonly photos = signal<ReadonlyMap<string, string | null>>(new Map());
  private readonly requested = new Set<string>();
  /** What was last written for the signed-in user, to skip writes that change nothing. */
  private synced: { uid: string; photo: string | null } | null = null;

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      if (!user) {
        // Another account may sign in next with different read rights; start over.
        untracked(() => this.photos.set(new Map()));
        this.requested.clear();
        this.synced = null;
        return;
      }
      const photo = user.photoURL ?? null;
      untracked(() => this.remember(user.id, photo));
      void this.sync(user.id, photo);
    });
  }

  /** The person's photo, or null (no photo, not loaded yet, or not visible to this viewer). Reactive. */
  photoOf(uid: string): string | null {
    return this.photos().get(uid) ?? null;
  }

  /** Loads the photos of these people once per session; `photoOf` updates as they arrive. */
  load(uids: Iterable<string>): void {
    for (const uid of uids) {
      if (!uid || this.requested.has(uid)) continue;
      this.requested.add(uid);
      getDoc(doc(this.db, 'avatars', uid)).then(
        (snap) => {
          const photo = snap.get('photoURL');
          this.remember(uid, typeof photo === 'string' && photo ? photo : null);
        },
        // Not allowed (another customer) or offline: show the initial instead.
        () => this.remember(uid, null),
      );
    }
  }

  private remember(uid: string, photo: string | null): void {
    this.requested.add(uid);
    this.photos.update((map) => new Map(map).set(uid, photo));
  }

  private async sync(uid: string, photo: string | null): Promise<void> {
    if (this.synced?.uid === uid && this.synced.photo === photo) return;
    this.synced = { uid, photo };
    try {
      const ref = doc(this.db, 'avatars', uid);
      const current = await getDoc(ref);
      if (current.exists() && (current.get('photoURL') ?? null) === photo) return;
      await setDoc(ref, { photoURL: photo, updatedAt: serverTimestamp() });
    } catch {
      // Rules not deployed yet, or offline: try again the next time the photo or session changes.
      this.synced = null;
    }
  }
}

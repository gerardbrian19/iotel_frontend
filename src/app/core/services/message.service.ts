import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  DocumentData,
  DocumentReference,
  QueryDocumentSnapshot,
  WriteBatch,
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Observable, from, map } from 'rxjs';
import { FIRESTORE } from '../firebase/firebase';
import { dataOf, isoOf } from '../firebase/timestamps';
import { Conversation, Message, User } from '../models';
import { AuthService } from './auth.service';

const CONVERSATIONS = 'conversations';

/** Which unread counter belongs to whom: customers read `customerUnread`, staff and admins share `staffUnread`. */
function unreadField(role: User['role']): 'customerUnread' | 'staffUnread' {
  return role === 'customer' ? 'customerUnread' : 'staffUnread';
}

function toConversation(
  snap: QueryDocumentSnapshot<DocumentData>,
  role: User['role'],
): Conversation {
  const data = dataOf(snap);
  return {
    id: snap.id,
    customerId: String(data['customerId'] ?? ''),
    customerName: String(data['customerName'] ?? ''),
    subject: String(data['subject'] ?? ''),
    bookingId: typeof data['bookingId'] === 'string' ? data['bookingId'] : undefined,
    lastMessage: String(data['lastMessage'] ?? ''),
    lastMessageAt: isoOf(data['lastMessageAt']),
    unreadCount: Number(data[unreadField(role)]) || 0,
  };
}

function toMessage(snap: QueryDocumentSnapshot<DocumentData>, conversationId: string): Message {
  const data = dataOf(snap);
  return {
    id: snap.id,
    conversationId,
    senderId: String(data['senderId'] ?? ''),
    senderName: String(data['senderName'] ?? ''),
    senderRole:
      data['senderRole'] === 'admin' || data['senderRole'] === 'staff'
        ? data['senderRole']
        : 'customer',
    kind: data['kind'] === 'event' ? 'event' : 'text',
    content: String(data['content'] ?? ''),
    sentAt: isoOf(data['sentAt']),
  };
}

/**
 * Chat between a customer and the shop, stored as `conversations/{id}` with the messages in
 * `conversations/{id}/messages/{id}`. A customer sees their own threads; staff and admins see all of them.
 *
 * The list is streamed into `conversations` while someone is signed in. The thread that is `open` also streams
 * its messages into `messages`, and its unread counter is cleared while it is on screen.
 */
@Injectable({ providedIn: 'root' })
export class MessageService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);

  private readonly _conversations = signal<Conversation[]>([]);
  private readonly _messages = signal<Message[]>([]);
  private readonly _activeId = signal<string | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal(false);

  /** Newest activity first. */
  readonly conversations = this._conversations.asReadonly();
  /** Messages of the open thread, oldest first. */
  readonly messages = this._messages.asReadonly();
  readonly activeId = this._activeId.asReadonly();
  readonly active = computed(
    () => this._conversations().find((c) => c.id === this._activeId()) ?? null,
  );
  readonly unreadTotal = computed(() =>
    this._conversations().reduce((sum, c) => sum + c.unreadCount, 0),
  );
  /** True until the first snapshot (or error) arrives. */
  readonly loading = this._loading.asReadonly();
  /** True when the list could not be loaded. */
  readonly error = this._error.asReadonly();

  private readonly viewer = computed(() => {
    const user = this.auth.currentUser();
    return user ? { id: user.id, role: user.role } : null;
  });

  constructor() {
    effect((onCleanup) => {
      const viewer = this.viewer();
      untracked(() => {
        this._conversations.set([]);
        this._error.set(false);
        this._loading.set(viewer !== null);
      });
      if (!viewer) return;

      const source =
        viewer.role === 'customer'
          ? query(collection(this.db, CONVERSATIONS), where('customerId', '==', viewer.id))
          : collection(this.db, CONVERSATIONS);
      const unsubscribe = onSnapshot(
        source,
        (snapshot) => {
          const list = snapshot.docs
            .map((d) => toConversation(d, viewer.role))
            .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
          this._conversations.set(list);
          this._error.set(false);
          this._loading.set(false);
        },
        (err) => {
          console.error('Could not load conversations', err);
          this._error.set(true);
          this._loading.set(false);
        },
      );
      onCleanup(unsubscribe);
    });

    effect((onCleanup) => {
      const id = this._activeId();
      const viewer = this.viewer();
      untracked(() => this._messages.set([]));
      if (!id || !viewer) return;

      const unsubscribe = onSnapshot(
        query(collection(this.db, CONVERSATIONS, id, 'messages'), orderBy('sentAt')),
        (snapshot) => this._messages.set(snapshot.docs.map((d) => toMessage(d, id))),
        (err) => console.error('Could not load messages', err),
      );
      onCleanup(unsubscribe);
    });

    // Anything that arrives while the thread is on screen is read straight away.
    effect(() => {
      const conversation = this.active();
      if (conversation && conversation.unreadCount > 0) {
        untracked(() => this.markRead(conversation.id));
      }
    });
  }

  /** Shows a thread (streams its messages and clears its unread badge); `null` closes it. */
  open(conversationId: string | null): void {
    this._activeId.set(conversationId);
  }

  close(): void {
    this._activeId.set(null);
  }

  /** Starts a general inquiry from the customer's side. Resolves with the new conversation's id. */
  createConversation(subject: string, firstMessage: string): Observable<string> {
    return this.commit((batch) => {
      const user = this.requireUser();
      const id = this.newId();
      this.stageConversation(batch, id, {
        customerId: user.id,
        customerName: user.name,
        subject,
        firstMessage,
      });
      return id;
    });
  }

  /** Sends a text message as the signed-in user. */
  sendMessage(conversationId: string, content: string): Observable<void> {
    return this.commit((batch) => this.stageMessage(batch, conversationId, content.trim())).pipe(
      map(() => void 0),
    );
  }

  /** A fresh conversation id, so a caller can stage the conversation and link other documents to it in one batch. */
  newId(): string {
    return doc(collection(this.db, CONVERSATIONS)).id;
  }

  /**
   * Adds a conversation with its first message, sent by the customer, to `batch`. `bookingId` links a booking thread
   * (the booking must be created in the same batch; see firestore.rules).
   */
  stageConversation(
    batch: WriteBatch,
    id: string,
    input: {
      customerId: string;
      customerName: string;
      subject: string;
      firstMessage: string;
      bookingId?: string;
    },
  ): void {
    const user = this.requireUser();
    const ref = doc(this.db, CONVERSATIONS, id);
    batch.set(ref, {
      customerId: input.customerId,
      customerName: input.customerName,
      subject: input.subject,
      ...(input.bookingId ? { bookingId: input.bookingId } : {}),
      lastMessage: input.firstMessage,
      lastMessageAt: serverTimestamp(),
      customerUnread: 0,
      staffUnread: 1,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(collection(ref, 'messages')), {
      senderId: user.id,
      senderName: user.name,
      senderRole: user.role,
      kind: 'text',
      content: input.firstMessage,
      sentAt: serverTimestamp(),
    });
  }

  /**
   * Adds a message from the signed-in user to `batch` and moves the thread's preview and the other side's unread
   * counter along with it. `event` lines are status updates ("Quote confirmed") that the chat renders as a note.
   */
  stageMessage(
    batch: WriteBatch,
    conversationId: string,
    content: string,
    kind: Message['kind'] = 'text',
  ): void {
    const user = this.requireUser();
    const ref: DocumentReference = doc(this.db, CONVERSATIONS, conversationId);
    batch.set(doc(collection(ref, 'messages')), {
      senderId: user.id,
      senderName: user.name,
      senderRole: user.role,
      kind,
      content,
      sentAt: serverTimestamp(),
    });
    batch.update(ref, {
      lastMessage: content,
      lastMessageAt: serverTimestamp(),
      [unreadField(user.role === 'customer' ? 'staff' : 'customer')]: increment(1),
    });
  }

  private markRead(conversationId: string): void {
    const user = this.auth.currentUser();
    if (!user) return;
    updateDoc(doc(this.db, CONVERSATIONS, conversationId), { [unreadField(user.role)]: 0 }).catch(
      (err) => console.error('Could not mark the conversation as read', err),
    );
  }

  private requireUser(): User {
    const user = this.auth.currentUser();
    if (!user) throw new Error('Sign in to send messages.');
    return user;
  }

  private commit<T>(build: (batch: WriteBatch) => T): Observable<T> {
    try {
      const batch = writeBatch(this.db);
      const result = build(batch);
      return from(batch.commit().then(() => result));
    } catch (err) {
      return from(Promise.reject(err));
    }
  }
}

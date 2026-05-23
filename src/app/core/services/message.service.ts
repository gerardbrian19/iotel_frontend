import { Injectable, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Conversation, Message } from '../models';
import { MOCK_CONVERSATIONS } from '../mocks/mock-data';

@Injectable({ providedIn: 'root' })
export class MessageService {
  private readonly _conversations = signal<Conversation[]>([...MOCK_CONVERSATIONS]);
  readonly conversations = this._conversations.asReadonly();

  getAll(): Observable<Conversation[]> {
    return of(this._conversations());
  }

  getByCustomer(customerId: number): Observable<Conversation[]> {
    return of(this._conversations().filter(c => c.customerId === customerId));
  }

  getById(id: number): Observable<Conversation | undefined> {
    return of(this._conversations().find(c => c.id === id));
  }

  createConversation(customerId: number, customerName: string, subject: string, firstMessage: string, senderId: number, senderName: string): Observable<Conversation> {
    const now = new Date().toISOString();
    const msg: Message = {
      id: Date.now(),
      conversationId: Date.now() + 1,
      senderId,
      senderName,
      senderRole: 'customer',
      content: firstMessage,
      sentAt: now,
    };
    const conv: Conversation = {
      id: msg.conversationId,
      customerId,
      customerName,
      subject,
      lastMessage: firstMessage,
      lastMessageAt: now,
      unreadCount: 0,
      messages: [msg],
    };
    msg.conversationId = conv.id;
    this._conversations.update(list => [conv, ...list]);
    return of(conv);
  }

  sendMessage(conversationId: number, senderId: number, senderName: string, senderRole: Message['senderRole'], content: string): Observable<Message> {
    const now = new Date().toISOString();
    const msg: Message = {
      id: Date.now(),
      conversationId,
      senderId,
      senderName,
      senderRole,
      content,
      sentAt: now,
    };
    this._conversations.update(list =>
      list.map(c =>
        c.id === conversationId
          ? { ...c, messages: [...c.messages, msg], lastMessage: content, lastMessageAt: now }
          : c
      )
    );
    return of(msg);
  }

  markRead(conversationId: number): void {
    this._conversations.update(list =>
      list.map(c => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
    );
  }
}

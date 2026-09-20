export interface Message {
  /** `conversations/{cid}/messages/{id}` document id. */
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: 'customer' | 'admin' | 'staff';
  /** `event` is a status line such as "Quote confirmed"; it is shown centred instead of as a bubble. */
  kind: 'text' | 'event';
  content: string;
  sentAt: string;
}

/** Messages are a subcollection (`MessageService.messages` streams the open thread), not embedded here. */
export interface Conversation {
  /** `conversations/{id}` document id. */
  id: string;
  customerId: string;
  customerName: string;
  subject: string;
  /** Set when the thread belongs to a service booking. */
  bookingId?: string;
  lastMessage: string;
  lastMessageAt: string;
  /** Unread messages for the signed-in viewer (customers and staff each have their own counter). */
  unreadCount: number;
}

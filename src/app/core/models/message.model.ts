export interface Message {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  senderRole: 'customer' | 'admin' | 'staff';
  content: string;
  sentAt: string;
}

export interface Conversation {
  id: number;
  customerId: number;
  customerName: string;
  subject: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  messages: Message[];
}

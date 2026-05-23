import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { MessageService } from '../../../core/services/message.service';
import { AuthService } from '../../../core/services/auth.service';
import { ChatPanelComponent } from '../../../shared/components/chat-panel/chat-panel.component';
import { Conversation } from '../../../core/models';

@Component({
  selector: 'app-staff-messages',
  standalone: true,
  imports: [SlicePipe, NzBadgeModule, NzIconModule, ChatPanelComponent],
  templateUrl: './messages.component.html',
  styleUrl: './messages.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffMessagesComponent {
  private readonly messageService = inject(MessageService);
  private readonly auth = inject(AuthService);

  readonly conversations = this.messageService.conversations;
  readonly selectedConversation = signal<Conversation | null>(null);
  readonly currentUserId = this.auth.currentUser()?.id ?? 0;
  readonly inThread = signal(false);

  selectConversation(c: Conversation) {
    this.selectedConversation.set(c);
    this.inThread.set(true);
    this.messageService.markRead(c.id);
  }

  onMessageSent(text: string) {
    const conv = this.selectedConversation();
    if (!conv) return;
    const user = this.auth.currentUser();
    this.messageService.sendMessage(conv.id, this.currentUserId, user?.name ?? 'Staff', user?.role ?? 'staff', text).subscribe(() => {
      this.selectedConversation.set(this.messageService.conversations().find(c => c.id === conv.id) ?? conv);
    });
  }

  unreadCount(c: Conversation) { return c.unreadCount; }
}

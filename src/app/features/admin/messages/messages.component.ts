import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SlicePipe } from '@angular/common';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { MessageService } from '../../../core/services/message.service';
import { AuthService } from '../../../core/services/auth.service';
import { ChatPanelComponent } from '../../../shared/components/chat-panel/chat-panel.component';
import { Conversation } from '../../../core/models';

@Component({
  selector: 'app-admin-messages',
  standalone: true,
  imports: [SlicePipe, NzBadgeModule, NzIconModule, ChatPanelComponent],
  templateUrl: './messages.component.html',
  styleUrl: './messages.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminMessagesComponent {
  private readonly messageService = inject(MessageService);
  private readonly auth = inject(AuthService);
  private readonly message = inject(NzMessageService);
  private readonly route = inject(ActivatedRoute);

  readonly conversations = this.messageService.conversations;
  readonly selectedConversation = this.messageService.active;
  readonly messages = this.messageService.messages;
  readonly currentUserId = this.auth.currentUser()?.id ?? '';
  /** On small screens the list and the thread are separate views. */
  readonly inThread = signal(false);

  constructor() {
    // A booking's "Open chat" link lands here with ?conversation=<id>.
    const requested = this.route.snapshot.queryParamMap.get('conversation');
    if (requested) {
      this.messageService.open(requested);
      this.inThread.set(true);
    }
    inject(DestroyRef).onDestroy(() => this.messageService.close());
  }

  selectConversation(c: Conversation) {
    this.messageService.open(c.id);
    this.inThread.set(true);
  }

  onMessageSent(text: string) {
    const conv = this.selectedConversation();
    if (!conv) return;
    this.messageService.sendMessage(conv.id, text).subscribe({
      error: err => {
        console.error('Could not send message', err);
        this.message.error('Your message could not be sent. Please try again.');
      },
    });
  }
}

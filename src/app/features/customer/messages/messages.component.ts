import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { MessageService } from '../../../core/services/message.service';
import { AuthService } from '../../../core/services/auth.service';
import { Conversation } from '../../../core/models';
import { ChatPanelComponent } from '../../../shared/components/chat-panel/chat-panel.component';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [
    DatePipe, FormsModule, ReactiveFormsModule,
    NzButtonModule, NzIconModule, NzInputModule, NzBadgeModule,
    NzEmptyModule, NzModalModule, NzFormModule, ChatPanelComponent,
  ],
  templateUrl: './messages.component.html',
  styleUrl: './messages.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessagesComponent {
  private readonly msgService = inject(MessageService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly message = inject(NzMessageService);
  private readonly route = inject(ActivatedRoute);

  readonly user = this.auth.currentUser;
  readonly conversations = this.msgService.conversations;
  readonly activeConversation = this.msgService.active;
  readonly messages = this.msgService.messages;
  readonly newConvVisible = signal(false);
  readonly sending = signal(false);
  /** On small screens the list and the thread are separate views. */
  readonly inThread = signal(false);

  readonly newConvForm = this.fb.group({
    subject: ['', [Validators.required, Validators.maxLength(120)]],
    firstMessage: ['', [Validators.required, Validators.maxLength(2000)]],
  });

  constructor() {
    // A booking's "Open chat" link lands here with ?conversation=<id>.
    const requested = this.route.snapshot.queryParamMap.get('conversation');
    if (requested) {
      this.msgService.open(requested);
      this.inThread.set(true);
    }
    inject(DestroyRef).onDestroy(() => this.msgService.close());

    // Otherwise start on the latest thread (desktop shows list and thread side by side).
    effect(() => {
      const list = this.conversations();
      untracked(() => {
        if (this.msgService.activeId() === null && list.length > 0) this.msgService.open(list[0].id);
      });
    });
  }

  selectConversation(conv: Conversation): void {
    this.msgService.open(conv.id);
    this.inThread.set(true);
  }

  sendMessage(text: string): void {
    const conv = this.activeConversation();
    if (!conv) return;
    this.msgService.sendMessage(conv.id, text).subscribe({
      error: err => {
        console.error('Could not send message', err);
        this.message.error('Your message could not be sent. Please try again.');
      },
    });
  }

  createConversation(): void {
    if (this.newConvForm.invalid || this.sending()) return;
    const v = this.newConvForm.getRawValue();
    this.sending.set(true);
    this.msgService.createConversation(v.subject!.trim(), v.firstMessage!.trim()).subscribe({
      next: id => {
        this.sending.set(false);
        this.msgService.open(id);
        this.inThread.set(true);
        this.newConvVisible.set(false);
        this.newConvForm.reset();
      },
      error: err => {
        console.error('Could not start conversation', err);
        this.sending.set(false);
        this.message.error('We could not start the conversation. Please try again.');
      },
    });
  }
}

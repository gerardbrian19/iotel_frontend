import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
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
export class MessagesComponent implements OnInit {
  private readonly msgService = inject(MessageService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly user = this.auth.currentUser;
  readonly conversations = signal<Conversation[]>([]);
  readonly activeConversation = signal<Conversation | null>(null);
  readonly newConvVisible = signal(false);
  readonly inThread = signal(false);

  readonly newConvForm = this.fb.group({
    subject: ['', Validators.required],
    firstMessage: ['', Validators.required],
  });

  ngOnInit(): void {
    const user = this.user();
    if (user) {
      this.msgService.getByCustomer(user.id).subscribe(convs => {
        this.conversations.set(convs);
        if (convs.length > 0) this.selectConversation(convs[0]);
      });
    }
  }

  selectConversation(conv: Conversation): void {
    this.activeConversation.set(conv);
    this.inThread.set(true);
    this.msgService.markRead(conv.id);
    this.conversations.update(list =>
      list.map(c => c.id === conv.id ? { ...c, unreadCount: 0 } : c)
    );
  }

  sendMessage(text: string): void {
    const user = this.user();
    const conv = this.activeConversation();
    if (!user || !conv) return;
    this.msgService.sendMessage(conv.id, user.id, user.name, 'customer', text).subscribe(() => {
      this.msgService.getByCustomer(user.id).subscribe(convs => {
        this.conversations.set(convs);
        const updated = convs.find(c => c.id === conv.id);
        if (updated) this.activeConversation.set(updated);
      });
    });
  }

  createConversation(): void {
    if (this.newConvForm.invalid) return;
    const user = this.user()!;
    const v = this.newConvForm.value;
    this.msgService.createConversation(user.id, user.name, v.subject!, v.firstMessage!, user.id, user.name)
      .subscribe(conv => {
        this.conversations.update(list => [conv, ...list]);
        this.activeConversation.set(conv);
        this.newConvVisible.set(false);
        this.newConvForm.reset();
      });
  }
}

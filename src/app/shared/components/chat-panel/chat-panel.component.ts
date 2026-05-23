import {
  ChangeDetectionStrategy, Component, inject, input, output, signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { Conversation } from '../../../core/models';

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [DatePipe, FormsModule, NzButtonModule, NzIconModule, NzInputModule],
  templateUrl: './chat-panel.component.html',
  styleUrl: './chat-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatPanelComponent {
  readonly conversation = input.required<Conversation>();
  readonly currentUserId = input.required<number>();
  readonly messageSent = output<string>();

  readonly replyText = signal('');

  send(): void {
    const text = this.replyText().trim();
    if (!text) return;
    this.messageSent.emit(text);
    this.replyText.set('');
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }
}

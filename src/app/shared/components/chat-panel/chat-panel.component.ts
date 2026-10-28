import {
  ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, effect, inject, input, output, signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { Conversation, Message } from '../../../core/models';
import { AvatarService } from '../../../core/services/avatar.service';
import { BookingService } from '../../../core/services/booking.service';
import { BookingPanelComponent } from '../booking-panel/booking-panel.component';

/**
 * One message as shown: other people's runs of messages are grouped like Messenger, with the sender's name above the
 * first one and their profile picture (or initial) beside the last one.
 */
interface ChatRow {
  msg: Message;
  mine: boolean;
  /** First of a run by the same sender: shows their name. */
  first: boolean;
  /** Last of a run by the same sender: shows their picture. */
  last: boolean;
}

/** One thread: the booking it belongs to (if any), the messages and the reply box. The parent supplies the messages. */
@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    NzAvatarModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    BookingPanelComponent,
  ],
  templateUrl: './chat-panel.component.html',
  styleUrl: './chat-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatPanelComponent {
  private readonly bookings = inject(BookingService);
  readonly avatars = inject(AvatarService);

  readonly conversation = input.required<Conversation>();
  readonly messages = input.required<Message[]>();
  readonly currentUserId = input.required<string>();
  readonly messageSent = output<string>();

  readonly replyText = signal('');

  /** The booking this thread is about, once it has loaded. */
  readonly booking = computed(() => {
    const id = this.conversation().bookingId;
    return id ? (this.bookings.byId().get(id) ?? null) : null;
  });

  readonly rows = computed<ChatRow[]>(() => {
    const me = this.currentUserId();
    const list = this.messages();
    // Event lines (status changes) break a run, as they sit between the bubbles.
    const sameRun = (a: Message | undefined, b: Message) =>
      !!a && a.kind !== 'event' && a.senderId === b.senderId;
    return list.map((msg, i) => ({
      msg,
      mine: msg.senderId === me,
      first: !sameRun(list[i - 1], msg),
      last: !sameRun(list[i + 1], msg),
    }));
  });

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  constructor() {
    // Fetch the pictures of everyone else in the thread (once per person per session).
    effect(() => {
      const me = this.currentUserId();
      this.avatars.load(
        this.messages()
          .filter((m) => m.kind !== 'event' && m.senderId !== me)
          .map((m) => m.senderId),
      );
    });

    // Keep the newest message in view as the thread loads and grows.
    afterRenderEffect(() => {
      this.messages();
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

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

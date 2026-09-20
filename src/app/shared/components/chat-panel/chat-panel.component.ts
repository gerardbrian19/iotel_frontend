import {
  ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, input, output, signal, viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { Conversation, Message } from '../../../core/models';
import { BookingService } from '../../../core/services/booking.service';
import { BookingPanelComponent } from '../booking-panel/booking-panel.component';

/** One thread: the booking it belongs to (if any), the messages and the reply box. The parent supplies the messages. */
@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [DatePipe, FormsModule, NzButtonModule, NzIconModule, NzInputModule, BookingPanelComponent],
  templateUrl: './chat-panel.component.html',
  styleUrl: './chat-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatPanelComponent {
  private readonly bookings = inject(BookingService);

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

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  constructor() {
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

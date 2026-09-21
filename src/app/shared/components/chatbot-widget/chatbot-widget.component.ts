import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AssistantLink, AssistantReply } from '../../../core/assistant/assistant-engine';
import { Product } from '../../../core/models';
import { AssistantService } from '../../../core/services/assistant.service';
import { PLACEHOLDER_IMAGE, onImageError } from '../../utils/product-image';

interface ChatMessage {
  id: number;
  from: 'bot' | 'user';
  text: string;
  products?: Product[];
  links?: AssistantLink[];
  followUps?: string[];
}

const MAX_LENGTH = 200;
/** Below this width the panel covers the screen and closes itself when a link navigates away. */
const MOBILE_QUERY = '(max-width: 640px)';

@Component({
  selector: 'app-chatbot-widget',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, RouterLink],
  templateUrl: './chatbot-widget.component.html',
  styleUrl: './chatbot-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatbotWidgetComponent {
  private readonly assistant = inject(AssistantService);
  private readonly injector = inject(Injector);

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly inputEl = viewChild<ElementRef<HTMLInputElement>>('inputEl');

  private nextId = 0;
  private replyTimer: ReturnType<typeof setTimeout> | undefined;

  readonly maxLength = MAX_LENGTH;
  readonly placeholderImage = PLACEHOLDER_IMAGE;
  readonly onImageError = onImageError;
  readonly topics = this.assistant.topics;

  readonly isOpen = signal(false);
  readonly expanded = signal(false);
  readonly typing = signal(false);
  readonly input = signal('');
  /** The topic tray (topic pills + their questions) shows on the welcome screen and when reopened. */
  readonly showTopics = signal(true);
  readonly activeTopicId = signal(this.topics[0].id);
  readonly messages = signal<ChatMessage[]>([this.botMessage(this.assistant.welcome())]);

  readonly activeQuestions = computed(
    () => this.topics.find((t) => t.id === this.activeTopicId())?.questions ?? [],
  );
  /** Suggested next questions belong to the latest bot reply only. */
  readonly followUps = computed(() => {
    const last = this.messages().at(-1);
    return last?.from === 'bot' ? (last.followUps ?? []) : [];
  });
  readonly canSend = computed(() => this.input().trim().length > 0 && !this.typing());

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.replyTimer));
  }

  toggle(): void {
    this.isOpen.update((open) => !open);
    if (this.isOpen()) {
      this.afterRender(() => {
        this.inputEl()?.nativeElement.focus({ preventScroll: true });
        this.scrollToBottom();
      });
    }
  }

  toggleSize(): void {
    this.expanded.update((v) => !v);
    this.afterRender(() => this.scrollToBottom());
  }

  /** Starts a fresh conversation. */
  reset(): void {
    clearTimeout(this.replyTimer);
    this.typing.set(false);
    this.input.set('');
    this.showTopics.set(true);
    this.activeTopicId.set(this.topics[0].id);
    this.messages.set([this.botMessage(this.assistant.welcome())]);
    this.afterRender(() => this.scrollToBottom());
  }

  toggleTopics(): void {
    this.showTopics.update((v) => !v);
    this.afterRender(() => this.scrollToBottom());
  }

  /** Sends what is typed, or a suggested question when one is passed in. */
  send(question?: string): void {
    const text = (question ?? this.input()).trim().slice(0, MAX_LENGTH);
    if (!text || this.typing()) return;

    this.messages.update((list) => [...list, { id: this.nextId++, from: 'user', text }]);
    this.input.set('');
    this.showTopics.set(false);
    this.typing.set(true);
    this.afterRender(() => this.scrollToBottom());

    // A short pause so replies feel like an answer rather than a page refresh.
    this.replyTimer = setTimeout(() => this.reply(text), 450);
  }

  onNavigate(): void {
    if (window.matchMedia(MOBILE_QUERY).matches) this.isOpen.set(false);
  }

  private reply(text: string): void {
    let message: ChatMessage;
    try {
      message = this.botMessage(this.assistant.ask(text));
    } catch (err) {
      console.error('Assistant failed to answer', err);
      message = this.botMessage({
        text: 'Sorry, something went wrong on my side. Please try again, or message our team.',
        links: [{ label: 'Message our team', url: '/customer/messages' }],
      });
    }
    this.typing.set(false);
    this.messages.update((list) => [...list, message]);
    this.afterRender(() => this.scrollToBottom());
  }

  private botMessage(reply: AssistantReply): ChatMessage {
    return { id: this.nextId++, from: 'bot', ...reply };
  }

  private afterRender(fn: () => void): void {
    afterNextRender(fn, { injector: this.injector });
  }

  /** Follows the conversation, but keeps the greeting in view until the customer says something. */
  private scrollToBottom(): void {
    const el = this.scroller()?.nativeElement;
    if (!el) return;
    const top = this.messages().length > 1 ? el.scrollHeight : 0;
    el.scrollTo({ top, behavior: 'smooth' });
  }
}

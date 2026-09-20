import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { RouterLink } from '@angular/router';

interface ChatMessage {
  from: 'bot' | 'user';
  text: string;
}

const RESPONSES: Record<string, string> = {
  default: "I'm here to help! You can ask about our products, orders, or services.",
  hello: 'Hello! How can I help you today?',
  hi: 'Hi there! How can I assist you?',
  order: 'You can track your orders in the Orders section. Is there anything specific you need help with?',
  price: 'Our prices vary by product. Browse the catalog for the latest pricing.',
  repair: 'We offer radio repair services. Visit the Services page to book a repair.',
  shipping: 'We offer shipping across the Philippines for a flat ₱250 per order.',
  return: 'For returns, please contact our support team via the Messages section.',
  contact: 'You can reach us via the Messages section or visit our service center.',
};

function getResponse(input: string): string {
  const lower = input.toLowerCase();
  for (const [key, response] of Object.entries(RESPONSES)) {
    if (key !== 'default' && lower.includes(key)) {
      return response;
    }
  }
  return RESPONSES['default'];
}

@Component({
  selector: 'app-chatbot-widget',
  standalone: true,
  imports: [FormsModule, NzButtonModule, NzIconModule, RouterLink],
  templateUrl: './chatbot-widget.component.html',
  styleUrl: './chatbot-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatbotWidgetComponent {
  readonly isOpen = signal(false);
  readonly messages = signal<ChatMessage[]>([
    { from: 'bot', text: "Hi! I'm IOTEL Assistant. How can I help you today?" },
  ]);
  inputText = '';

  toggle(): void {
    this.isOpen.set(!this.isOpen());
  }

  send(): void {
    const text = this.inputText.trim();
    if (!text) return;
    this.messages.update(m => [...m, { from: 'user', text }]);
    const response = getResponse(text);
    setTimeout(() => {
      this.messages.update(m => [...m, { from: 'bot', text: response }]);
    }, 600);
    this.inputText = '';
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.send();
  }
}

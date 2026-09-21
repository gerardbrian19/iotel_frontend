import { Injectable, computed, inject } from '@angular/core';
import {
  ASSISTANT_TOPICS,
  AssistantReply,
  AssistantTopic,
  answer,
  welcomeReply,
} from '../assistant/assistant-engine';
import { AuthService } from './auth.service';
import { BookingService } from './booking.service';
import { CartService, SHIPPING_FEE } from './cart.service';
import { FavoritesService } from './favorites.service';
import { OrderService } from './order.service';
import { ProductService } from './product.service';

/**
 * The IOTEL Assistant. Answers questions from live app state (the same signals the screens use), so what it says about
 * products, open slots, bookings, orders and the cart always matches what the customer sees elsewhere. The matching
 * logic lives in `assistant-engine.ts`.
 */
@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly auth = inject(AuthService);
  private readonly products = inject(ProductService);
  private readonly bookings = inject(BookingService);
  private readonly orders = inject(OrderService);
  private readonly cart = inject(CartService);
  private readonly favorites = inject(FavoritesService);

  /** What the welcome screen offers: topics with the questions the assistant answers well. */
  readonly topics: readonly AssistantTopic[] = ASSISTANT_TOPICS;

  private readonly firstName = computed(() => {
    const name = this.auth.currentUser()?.name.trim();
    return name ? name.split(/\s+/)[0] : null;
  });

  welcome(): AssistantReply {
    return welcomeReply({ firstName: this.firstName() });
  }

  ask(text: string): AssistantReply {
    const uid = this.auth.currentUser()?.id;
    return answer(text, {
      firstName: this.firstName(),
      products: this.products.activeProducts(),
      services: this.bookings.services(),
      bookings: this.bookings.bookings(),
      takenSlots: this.bookings.takenSlots(),
      orders: this.orders.orders().filter((o) => o.customerId === uid),
      cart: {
        items: this.cart.items(),
        subtotal: this.cart.subtotal,
        shippingFee: this.cart.shippingFee,
        total: this.cart.total,
      },
      flatShippingFee: SHIPPING_FEE,
      favoritesCount: this.favorites.count(),
      now: new Date(),
    });
  }
}

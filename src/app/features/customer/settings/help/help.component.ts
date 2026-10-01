import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzCollapseModule } from 'ng-zorro-antd/collapse';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { BOOKING_HORIZON_DAYS, BOOKING_LEAD_DAYS } from '../../../../core/booking/schedule';
import { SHIPPING_FEE } from '../../../../core/services/cart.service';

interface HelpLink {
  icon: string;
  title: string;
  desc: string;
  route: string;
}

interface Faq {
  question: string;
  answer: string;
}

interface FaqGroup {
  title: string;
  icon: string;
  faqs: Faq[];
}

@Component({
  selector: 'app-settings-help',
  standalone: true,
  imports: [RouterLink, NzCollapseModule, NzIconModule, NzDividerModule],
  templateUrl: './help.component.html',
  styleUrl: './help.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpComponent {
  readonly links: HelpLink[] = [
    {
      icon: 'message',
      title: 'Contact Support',
      desc: 'Chat with our team about your orders, service bookings or a product question.',
      route: '/customer/messages',
    },
    {
      icon: 'file-text',
      title: 'My Orders',
      desc: 'Follow an order from Pending to Delivered and review what you bought.',
      route: '/customer/orders',
    },
    {
      icon: 'tool',
      title: 'My Bookings',
      desc: 'Book an installation or repair, and check on or pay for an existing booking.',
      route: '/customer/services',
    },
    {
      icon: 'info-circle',
      title: 'About IOTEL',
      desc: 'What Goldcomm Corporation offers and a step-by-step guide to using IOTEL.',
      route: '/customer/settings/about',
    },
    // Disabled until the Terms of Service and Privacy Policy documents exist.
    // { icon: 'file-text', title: 'Terms of Service', desc: 'Read our terms and conditions for using IOTEL.', route: '' },
    // { icon: 'lock', title: 'Privacy Policy', desc: 'Learn how we collect and protect your personal data.', route: '' },
  ];

  readonly faqGroups: FaqGroup[] = [
    {
      title: 'Orders & shipping',
      icon: 'shopping-cart',
      faqs: [
        {
          question: 'How do I place an order?',
          answer:
            'Add products to your cart, open the cart and press Checkout. Choose a saved shipping address (or add a new one), pick a payment method and confirm. Products marked "Price on request" cannot be added to the cart: message our team for a quotation instead.',
        },
        {
          question: 'How much is shipping?',
          answer: `We ship across the Philippines for a flat ₱${SHIPPING_FEE} per order, no matter how many items are in it.`,
        },
        {
          question: 'How do I track my order?',
          answer:
            'Open My Orders from the user menu. Every order moves through Pending, Processing, Shipped and Delivered, and shows its estimated delivery date. If something looks wrong, message our team and include the order number.',
        },
        {
          question: 'Why can I not add more of an item to my cart?',
          answer:
            'Quantities are capped at the stock we currently have. If you need more than what is listed, message our team and we will see what we can arrange.',
        },
      ],
    },
    {
      title: 'Payments',
      icon: 'wallet',
      faqs: [
        {
          question: 'Which payment methods do you accept?',
          answer:
            "GCash, Maya, credit and debit cards, GrabPay and QR Ph, all through PayMongo's secure checkout. Service bookings are paid the same way after we confirm and quote the job. We do not offer Cash on Delivery.",
        },
        {
          question: 'How does paying work?',
          answer:
            "When you press Pay, you are taken to PayMongo's secure page to finish the payment. Your order or booking is marked paid as soon as PayMongo confirms it, usually within seconds. If you leave without paying, use Pay now on the order; unpaid orders are cancelled after an hour.",
        },
        {
          question: 'Does IOTEL store my card or bank details?',
          answer:
            "No. You enter your card or wallet details on PayMongo's page, not in IOTEL. We only keep the PayMongo payment ID, the method you used and the amount.",
        },
      ],
    },
    {
      title: 'Service bookings',
      icon: 'tool',
      faqs: [
        {
          question: 'How do I book an installation or repair?',
          answer:
            'Go to Services, choose a service, pick a date and time slot and describe the problem. Your booking starts as Pending and a chat with our team is opened for it. Staff confirm the booking and send a quotation, you pay it, and staff mark the job Completed once it is done.',
        },
        {
          question: 'When can I book, and how far ahead?',
          answer: `We are open Monday to Saturday with one-hour slots in the morning and afternoon (closed for lunch, and on Sundays). Each slot takes one booking, so a taken slot will not be offered again. You can book from ${BOOKING_LEAD_DAYS} day from today and up to ${BOOKING_HORIZON_DAYS} days ahead.`,
        },
        {
          question: 'Can I cancel or reschedule a booking?',
          answer:
            "You can cancel a booking from My Bookings while it is Pending, or Confirmed as long as you have not submitted a payment; its slot is freed straight away. To change the date, ask our team in the booking's chat. If you have already paid, message them in the chat and they will handle it.",
        },
      ],
    },
    {
      title: 'Your account',
      icon: 'user',
      faqs: [
        {
          question: 'How do I add a profile picture?',
          answer:
            'Open Settings → Profile and choose Upload Photo. Pick a JPG, PNG or WebP image up to 5 MB; it is cropped to a square automatically. You can change or remove it at any time.',
        },
        {
          question: 'How do I add or change a shipping address?',
          answer:
            'Open My Addresses from the user menu (top-right). You can add, edit and delete addresses there and choose a default one for checkout.',
        },
        {
          question: 'What are favorites?',
          answer:
            'Press the heart on any product to save it. Your saved products are listed under My Favorites, so you can come back to them later.',
        },
      ],
    },
    {
      title: 'Returns & warranty',
      icon: 'safety',
      faqs: [
        {
          question: 'What is your return and warranty policy?',
          answer:
            'Return and warranty terms depend on the product. Please message our support team with the product name or order number and we will confirm what applies to you.',
        },
      ],
    },
  ];
}

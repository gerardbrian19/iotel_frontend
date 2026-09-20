import { PaymentMethod } from './order.model';

/** A bookable service. `id` is the `services/{id}` document id (a slug). */
export interface Service {
  id: string;
  title: string;
  /** Starting price in PHP; the final amount is quoted by staff after the customer describes the job. */
  price: number;
  description: string;
}

/**
 * Pending    – submitted by the customer, waiting for staff to discuss and quote.
 * Confirmed  – staff agreed the quote and date with the customer; the customer can now pay.
 * Paid       – staff verified the customer's payment.
 * Completed  – the service was carried out.
 */
export type BookingStatus = 'Pending' | 'Confirmed' | 'Paid' | 'Completed' | 'Cancelled';

/** Only statuses that still hold their time slot. */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = ['Pending', 'Confirmed', 'Paid'];

export type BookingPaymentMethod = Exclude<PaymentMethod, 'Cash on Delivery'>;

export const BOOKING_PAYMENT_METHODS: readonly BookingPaymentMethod[] = ['GCash', 'Bank Transfer'];

export interface BookingQuote {
  /** Final price in PHP that the customer pays. */
  amount: number;
  note: string;
  quotedAt?: string;
}

/** Submitted by the customer, then verified by staff against the reference number. */
export interface BookingPayment {
  method: BookingPaymentMethod;
  referenceNumber: string;
  amount: number;
  status: 'Submitted' | 'Verified';
  submittedAt?: string;
}

export interface Booking {
  /** `bookings/{id}` document id. */
  id: string;
  serviceId: string;
  serviceName: string;
  /** The service's starting price when it was booked. */
  servicePrice: number;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerMobile: string;
  /** Local calendar date, `YYYY-MM-DD`. */
  preferredDate: string;
  /** Slot start, `HH:mm`. */
  preferredTime: string;
  /** The customer's description of the problem or job. */
  notes: string;
  status: BookingStatus;
  /** The chat thread where the customer and staff discuss this booking. */
  conversationId: string;
  quote?: BookingQuote;
  payment?: BookingPayment;
  createdAt?: string;
  updatedAt?: string;
}

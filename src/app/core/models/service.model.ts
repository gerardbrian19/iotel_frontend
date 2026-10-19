import { Payment } from './payment.model';

/**
 * How a service's price is shown. Staff always quote the final amount after the customer describes the job.
 * fixed    – `price` is the price.
 * starting – `price` is the lowest it costs ("Starting at"). Documents without `pricing` are read as this.
 * quote    – no price is published; `price` is stored as 0.
 */
export const SERVICE_PRICING = ['fixed', 'starting', 'quote'] as const;
export type ServicePricing = (typeof SERVICE_PRICING)[number];

/** Highest service price in PHP. Mirrored in firestore.rules (`validService`). */
export const SERVICE_MAX_PRICE = 10_000_000;

export const SERVICE_PRICING_LABELS: Record<ServicePricing, string> = {
  fixed: 'Fixed Price',
  starting: 'Starting Price',
  quote: 'Request a Quotation',
};

/**
 * A bookable service. `id` is the `services/{id}` document id (a slug for seeded ones, an auto id otherwise).
 * Fields added after the first seed (`category`, `pricing`, `duration`, `isActive`, `imageUrl`) may be missing
 * from older documents; `toService` fills in the defaults.
 */
export interface Service {
  id: string;
  title: string;
  /** Price in PHP, read according to `pricing` (0 when `pricing` is 'quote'). */
  price: number;
  description: string;
  /** Free-text service type, e.g. "Repair"; empty when not set. */
  category: string;
  pricing: ServicePricing;
  /** Estimated duration or completion time as text, e.g. "1–2 hours"; empty when not set. */
  duration: string;
  /** Inactive services stay in Firestore (and in old bookings) but can't be booked. */
  isActive: boolean;
  /** A site image (`/images/…`) or web address; empty when not set. */
  imageUrl: string;
}

/** What admins and staff write to a `services/{id}` document. */
export type ServiceInput = Omit<Service, 'id'>;

/**
 * Pending    – submitted by the customer, waiting for staff to discuss and quote.
 * Confirmed  – staff agreed the quote and date with the customer; the customer can now pay.
 * Paid       – PayMongo confirmed the customer's payment.
 * Completed  – the service was carried out.
 */
export type BookingStatus = 'Pending' | 'Confirmed' | 'Paid' | 'Completed' | 'Cancelled';

/** Only statuses that still hold their time slot. */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = ['Pending', 'Confirmed', 'Paid'];

export interface BookingQuote {
  /** Final price in PHP that the customer pays. */
  amount: number;
  note: string;
  quotedAt?: string;
}

/** Created when the customer opens the PayMongo checkout for the quote; marked Paid by the backend webhook. */
export type BookingPayment = Payment;

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

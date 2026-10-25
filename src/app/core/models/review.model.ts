/**
 * A document of `productReviews/{productId}_{customerId}` (visible) or `hiddenReviews/{same id}` (hidden by an admin):
 * one per customer and product, written only by the Cloud Functions (functions/src/reviews.ts).
 */
export interface ProductReview {
  id: string;
  productId: string;
  productName: string;
  /** The delivered order the customer rated it from. */
  orderId: string;
  customerId: string;
  /** Shortened, e.g. "Juan D.". */
  customerName: string;
  /** 1–5 stars. */
  rating: number;
  /** May be empty. */
  comment: string;
  createdAt: string;
  updatedAt: string;
  /** Hidden by an admin: not shown to shoppers and not in the product's average. */
  hidden: boolean;
  hiddenAt?: string;
  hiddenByName?: string;
  hiddenReason?: string;
}

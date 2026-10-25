/** A document of `productReviews/{productId}_{customerId}`: one per customer and product, written by a Cloud Function. */
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
}

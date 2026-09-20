import { ShippingAddress } from './order.model';

/** A saved shipping address, stored as `users/{uid}/addresses/{id}`. At most one per customer is the default. */
export interface Address extends ShippingAddress {
  id: string;
  isDefault: boolean;
  createdAt?: string;
}

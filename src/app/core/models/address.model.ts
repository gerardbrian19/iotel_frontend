import { ShippingAddress } from './order.model';

/** Metro Manila (NCR) or one of the provinces. */
export type AddressArea = 'ncr' | 'province';

/**
 * The structured parts of a saved address, as entered in the address form, so it can be reopened with the same
 * dropdown selections. Codes are 10-digit PSGC codes (`public/locations/`, built by `npm run build:locations`).
 * The flat `ShippingAddress` fields (`addressLine`, `city`, `province`) are composed from these on save.
 */
export interface AddressDetails {
  /** Room/floor/unit no. and building name. */
  unit: string;
  /** House / lot and block no. */
  house: string;
  street: string;
  subdivision: string;
  area: AddressArea;
  /** Empty for Metro Manila. */
  provinceCode: string;
  cityCode: string;
  barangayCode: string;
  /** The barangay's name, kept so the address reads the same if the location lists change. */
  barangay: string;
}

/** A saved shipping address, stored as `users/{uid}/addresses/{id}`. At most one per customer is the default. */
export interface Address extends ShippingAddress {
  id: string;
  isDefault: boolean;
  /** Missing on addresses saved before the structured form (free-text address line only). */
  details?: AddressDetails;
  createdAt?: string;
}

/** What the address form saves. */
export interface AddressInput extends ShippingAddress {
  details: AddressDetails;
}

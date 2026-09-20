export const PRODUCT_CATEGORIES = [
  'Radios',
  'Radio Accessories',
  'Antennas',
  'Radio Infrastructure',
  'Marine & Public Address',
  'CCTV',
  'Networking',
  'Software & Licenses',
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/** A document of the Firestore `products` collection, keyed by its slug id (e.g. `kenwood-kmc30`). */
export interface Product {
  id: string;
  name: string;
  brand: string;
  model: string;
  category: ProductCategory;
  subcategory: string;
  description: string;
  imageUrl: string;
  /** Selling price in PHP (the `srp` field). `null` means the price is on request and the product can't be added to the cart. */
  price: number | null;
  oldPrice: number | null;
  stock: number;
  /** Inactive products are hidden from the storefront. */
  isActive: boolean;
  /** Derived: active and at least one unit in stock. Never stored. */
  inStock: boolean;
  searchKeywords: string[];
}

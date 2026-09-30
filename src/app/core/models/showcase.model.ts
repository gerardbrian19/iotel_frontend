import { Product } from './product.model';

/**
 * The public copy of a showcased product in `showcase/bestSellers` (readable without signing in). Holds only what the
 * landing page shows, never `dealerPrice`; `inStock` is derived when read, like on `Product`.
 */
export type ShowcaseProduct = Pick<
  Product,
  | 'id'
  | 'name'
  | 'brand'
  | 'category'
  | 'description'
  | 'imageUrl'
  | 'price'
  | 'stock'
  | 'isActive'
  | 'inStock'
>;

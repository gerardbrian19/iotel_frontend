export type ProductCategory = 'Handheld' | 'Marine' | 'Base Station' | 'Accessories';

export interface Product {
  id: number;
  name: string;
  category: ProductCategory;
  price: number;
  stock: number;
  inStock: boolean;
  imageUrl: string;
  description: string;
}

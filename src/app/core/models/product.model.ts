export type ProductCategory = 'Handheld' | 'Marine' | 'Base Station' | 'Accessories' | 'MOTOTRBO PORTABLE RADIOS' | 'Aviation' | 'Amateur' | 'Receiver' | 'Land Mobile';

export interface Product {
  id: number;
  name: string;
  category: ProductCategory;
  price: number;
  stock: number;
  inStock: boolean;
  imageUrl: string;
  images?: string[];
  variations?: string[];
  likes?: number;
  description: string;
}

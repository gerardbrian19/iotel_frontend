export type OrderStatus = 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
export type PaymentMethod = 'GCash' | 'Bank Transfer' | 'Cash on Delivery';

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
  imageUrl: string;
}

export interface ShippingAddress {
  fullName: string;
  addressLine: string;
  city: string;
  province: string;
  zip: string;
  mobile: string;
}

export interface Order {
  id: string;
  customerId: string;
  items: OrderItem[];
  status: OrderStatus;
  total: number;
  subtotal: number;
  shippingFee: number;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  address: ShippingAddress;
  createdAt: string;
  estimatedDelivery?: string;
}

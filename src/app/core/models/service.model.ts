export interface Service {
  id: number;
  title: string;
  price: number;
  description: string;
}

export type BookingStatus = 'Pending' | 'Confirmed' | 'Cancelled';

export interface Booking {
  id: number;
  serviceId: number;
  serviceName: string;
  customerId: number;
  customerName: string;
  customerEmail: string;
  customerMobile: string;
  preferredDate: string;
  preferredTime: string;
  status: BookingStatus;
  createdAt: string;
}

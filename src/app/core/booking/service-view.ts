import { Service } from '../models';

const peso = (amount: number) => `₱${amount.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

/** The price as customers read it: "₱500", "Starting at ₱500" or "Price on quotation". */
export function servicePriceLabel(service: Pick<Service, 'price' | 'pricing'>): string {
  switch (service.pricing) {
    case 'fixed': return peso(service.price);
    case 'quote': return 'Price on quotation';
    default: return `Starting at ${peso(service.price)}`;
  }
}

/** Short form for lists and dropdowns: "₱500", "from ₱500" or "quotation". */
export function serviceShortPrice(service: Pick<Service, 'price' | 'pricing'>): string {
  switch (service.pricing) {
    case 'fixed': return peso(service.price);
    case 'quote': return 'quotation';
    default: return `from ${peso(service.price)}`;
  }
}

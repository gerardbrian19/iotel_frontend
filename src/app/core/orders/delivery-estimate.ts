import { DeliveryZone, Order, ShippingAddress } from '../models';

/**
 * How long delivery takes, by where the order goes. The lists and day ranges are mirrored in
 * functions/src/delivery.ts, which stamps `deliveryZone` / `estimatedDeliveryFrom` / `estimatedDelivery` on new
 * orders; change both together. Province names are the PSA's (as in `public/locations/index.json`).
 */
export interface DeliveryZoneInfo {
  label: string;
  /** For sentences: "Cebu (Visayas)". */
  short: string;
  minDays: number;
  maxDays: number;
}

export const DELIVERY_ZONES: Record<DeliveryZone, DeliveryZoneInfo> = {
  'metro-manila': { label: 'Metro Manila', short: 'Metro Manila', minDays: 3, maxDays: 5 },
  luzon: { label: 'Luzon (outside Metro Manila)', short: 'Luzon', minDays: 5, maxDays: 7 },
  visayas: { label: 'Visayas', short: 'Visayas', minDays: 7, maxDays: 10 },
  mindanao: { label: 'Mindanao', short: 'Mindanao', minDays: 7, maxDays: 10 },
};

/** Lower-case, no accents (Las Piñas → las pinas), single spaces, no "City of" / "Province of". */
export function normalizePlace(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(city|province) of\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// prettier-ignore
const NCR_PLACES = [
  'metro manila', 'ncr', 'national capital region', 'manila', 'caloocan', 'las pinas', 'makati', 'malabon',
  'mandaluyong', 'marikina', 'muntinlupa', 'navotas', 'paranaque', 'pasay', 'pasig', 'pateros', 'quezon city',
  'san juan', 'taguig', 'valenzuela',
];
// prettier-ignore
const VISAYAS_PLACES = [
  'visayas', 'aklan', 'antique', 'capiz', 'guimaras', 'iloilo', 'negros occidental', 'negros oriental', 'negros',
  'siquijor', 'bohol', 'cebu', 'biliran', 'eastern samar', 'leyte', 'northern samar', 'samar', 'southern leyte',
  'bacolod', 'tacloban', 'lapu lapu', 'mandaue', 'ormoc', 'dumaguete', 'tagbilaran', 'boracay',
];
// prettier-ignore
const MINDANAO_PLACES = [
  'mindanao', 'zamboanga del norte', 'zamboanga del sur', 'zamboanga sibugay', 'zamboanga', 'bukidnon', 'camiguin',
  'lanao del norte', 'lanao del sur', 'misamis occidental', 'misamis oriental', 'davao de oro', 'compostela valley',
  'davao del norte', 'davao del sur', 'davao occidental', 'davao oriental', 'davao', 'cotabato', 'south cotabato',
  'sarangani', 'sultan kudarat', 'agusan del norte', 'agusan del sur', 'dinagat islands', 'surigao del norte',
  'surigao del sur', 'surigao', 'basilan', 'isabela city', 'maguindanao del norte', 'maguindanao del sur',
  'maguindanao', 'sulu', 'tawi tawi', 'special geographic area barmm', 'barmm', 'cagayan de oro', 'general santos',
  'iligan', 'butuan',
];
/** Only used to recognise a place in a question; any address that isn't NCR, Visayas or Mindanao is Luzon. */
// prettier-ignore
const LUZON_PLACES = [
  'luzon', 'abra', 'apayao', 'benguet', 'ifugao', 'kalinga', 'mountain province', 'ilocos norte', 'ilocos sur',
  'la union', 'pangasinan', 'batanes', 'cagayan', 'isabela', 'nueva vizcaya', 'quirino', 'aurora', 'bataan',
  'bulacan', 'nueva ecija', 'pampanga', 'tarlac', 'zambales', 'batangas', 'cavite', 'laguna', 'quezon', 'rizal',
  'marinduque', 'occidental mindoro', 'oriental mindoro', 'mindoro', 'palawan', 'romblon', 'albay',
  'camarines norte', 'camarines sur', 'catanduanes', 'masbate', 'sorsogon', 'baguio', 'angeles', 'olongapo',
  'lucena', 'puerto princesa', 'naga', 'legazpi', 'tagaytay', 'antipolo', 'calamba',
];

const PLACES: [string, DeliveryZone][] = [
  ...NCR_PLACES.map((p) => [p, 'metro-manila'] as [string, DeliveryZone]),
  ...VISAYAS_PLACES.map((p) => [p, 'visayas'] as [string, DeliveryZone]),
  ...MINDANAO_PLACES.map((p) => [p, 'mindanao'] as [string, DeliveryZone]),
  ...LUZON_PLACES.map((p) => [p, 'luzon'] as [string, DeliveryZone]),
  // Longest first, so "quezon city" wins over "quezon" and "negros oriental" over "negros".
].sort((a, b) => b[0].length - a[0].length);

/** Which zone a saved address is in: by province, then by city (for addresses typed before the structured form). */
export function deliveryZoneOf(address: Pick<ShippingAddress, 'province' | 'city'>): DeliveryZone {
  const province = normalizePlace(address.province);
  const city = normalizePlace(address.city);
  for (const value of [province, city]) {
    const hit = PLACES.find(([place]) => value === place);
    if (hit) return hit[1];
  }
  // Free text such as "Cebu City" or "Davao del Sur province".
  for (const value of [province, city]) {
    const hit = findPlaceIn(value);
    if (hit) return hit.zone;
  }
  return 'luzon';
}

/** The first place named in a question ("how long to Cebu?"), with its zone. */
export function findPlaceIn(text: string): { place: string; zone: DeliveryZone } | null {
  const q = ` ${normalizePlace(text)} `;
  const hit = PLACES.find(([place]) => q.includes(` ${place} `));
  return hit ? { place: hit[0], zone: hit[1] } : null;
}

/** `YYYY-MM-DD` in Manila, `days` after `from`. */
function manilaDateKey(from: Date, days: number): string {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Manila',
  });
}

export interface DeliveryEstimate {
  zone: DeliveryZone;
  /** `YYYY-MM-DD`. */
  from: string;
  to: string;
}

/** An order's delivery window: as stamped on it at checkout, or worked out from its address and date for older orders. */
export function deliveryEstimate(order: Order): DeliveryEstimate {
  if (order.deliveryZone && order.estimatedDeliveryFrom && order.estimatedDelivery) {
    return {
      zone: order.deliveryZone,
      from: order.estimatedDeliveryFrom,
      to: order.estimatedDelivery,
    };
  }
  const zone = deliveryZoneOf(order.address);
  // A just-placed order can briefly have no createdAt yet; count from now then.
  const created = new Date(order.createdAt);
  const placed = Number.isNaN(created.getTime()) ? new Date() : created;
  const { minDays, maxDays } = DELIVERY_ZONES[zone];
  return { zone, from: manilaDateKey(placed, minDays), to: manilaDateKey(placed, maxDays) };
}

/** "3–5 days". */
export function deliveryDaysLabel(zone: DeliveryZone): string {
  const { minDays, maxDays } = DELIVERY_ZONES[zone];
  return `${minDays}–${maxDays} days`;
}

import {
  BOOKING_HORIZON_DAYS,
  BOOKING_LEAD_DAYS,
  BOOKING_SLOTS,
  CLOSED_WEEKDAYS,
  addDays,
  firstBookableDate,
  formatSlot,
  formatTime,
  isOpenDate,
  slotId,
  toDateKey,
} from '../booking/schedule';
import {
  ACTIVE_BOOKING_STATUSES,
  Booking,
  BookingStatus,
  CartItem,
  Order,
  PRODUCT_CATEGORIES,
  Product,
  ProductCategory,
  Service,
} from '../models';

/**
 * The IOTEL Assistant's brain: keyword and intent matching over live app data. No backend or LLM is involved,
 * so it only answers what it can read from the app (catalog, services, the customer's own bookings, orders and
 * cart) plus a few fixed FAQs, and offers a human (Messages) whenever it is unsure.
 *
 * Pure on purpose: everything it needs comes in through `AssistantContext`.
 */

/** A navigation button shown under a reply. `url` is an app route. */
export interface AssistantLink {
  label: string;
  url: string;
  queryParams?: Record<string, string | number>;
}

export interface AssistantReply {
  text: string;
  /** Up to a few catalog products, rendered as cards. */
  products?: Product[];
  links?: AssistantLink[];
  /** Suggested next questions, each one is something `answer` understands. */
  followUps?: string[];
}

export interface AssistantContext {
  /** First name of the signed-in customer, if any. */
  firstName: string | null;
  /** Storefront products (active only). */
  products: readonly Product[];
  services: readonly Service[];
  /** The viewer's own bookings, newest first. */
  bookings: readonly Booking[];
  /** Ids of booked slots (`slotId`), from today on. */
  takenSlots: ReadonlySet<string>;
  /** The viewer's own orders. */
  orders: readonly Order[];
  cart: { items: readonly CartItem[]; subtotal: number; shippingFee: number; total: number };
  /** The flat shipping fee per order, shown even when the cart is empty. */
  flatShippingFee: number;
  favoritesCount: number;
  now: Date;
}

export interface AssistantTopic {
  id: string;
  icon: string;
  label: string;
  questions: readonly string[];
}

/** What the welcome screen offers. Every question must be something `answer` handles well. */
export const ASSISTANT_TOPICS: readonly AssistantTopic[] = [
  {
    id: 'products',
    icon: '🔎',
    label: 'Find products',
    questions: [
      'What products do you sell?',
      'Show me radios under ₱20,000',
      'Which products are in stock?',
      'What is your cheapest radio?',
      'Recommend a radio for security guards',
    ],
  },
  {
    id: 'schedule',
    icon: '📅',
    label: 'Booking schedule',
    questions: [
      'When is the next available slot?',
      'Is tomorrow available?',
      'What are your service hours?',
      'How far ahead can I book?',
    ],
  },
  {
    id: 'bookings',
    icon: '🛠️',
    label: 'My bookings',
    questions: [
      "What's the status of my bookings?",
      'How do I pay for my booking?',
      'How do I reschedule a booking?',
      'How do I cancel a booking?',
    ],
  },
  {
    id: 'services',
    icon: '📋',
    label: 'Services',
    questions: [
      'What services do you offer?',
      'How do I book a service?',
      'How much is on-site installation?',
      'Do you repair radios?',
    ],
  },
  {
    id: 'orders',
    icon: '📦',
    label: 'Orders & delivery',
    questions: [
      'Where is my order?',
      'How much is shipping?',
      'What payment methods do you accept?',
    ],
  },
  {
    id: 'cart',
    icon: '🛒',
    label: 'Cart & favorites',
    questions: ["What's in my cart?", 'How many favorites do I have?', 'How do I checkout?'],
  },
  {
    id: 'help',
    icon: '💬',
    label: 'Account & help',
    questions: [
      'How do I update my address?',
      'What is your return policy?',
      'What can you help me with?',
      'I want to talk to a human',
    ],
  },
];

// ─── small helpers ─────────────────────────────────────────────────────────────

const peso = (amount: number) => `₱${amount.toLocaleString('en-PH')}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const bullets = (lines: readonly string[]) => lines.map((l) => `• ${l}`).join('\n');
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const test = (q: string, re: RegExp) => re.test(q);

const dayLabel = (d: Date) =>
  d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
const longDayLabel = (d: Date) =>
  d.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
const weekdayName = (day: number) =>
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];

const MESSAGES: AssistantLink = { label: 'Message our team', url: '/customer/messages' };
const MY_BOOKINGS: AssistantLink = { label: 'Open my bookings', url: '/customer/services' };
const MY_ORDERS: AssistantLink = { label: 'Open my orders', url: '/customer/orders' };
const CATALOG: AssistantLink = { label: 'Browse the catalog', url: '/customer/catalog' };

// ─── schedule ──────────────────────────────────────────────────────────────────

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAY_WORDS: [RegExp, number][] = [
  [/\b(sunday|sun)\b/, 0],
  [/\b(monday|mon)\b/, 1],
  [/\b(tuesday|tues|tue)\b/, 2],
  [/\b(wednesday|wed)\b/, 3],
  [/\b(thursday|thurs|thur|thu)\b/, 4],
  [/\b(friday|fri)\b/, 5],
  [/\b(saturday|sat)\b/, 6],
];

/** A calendar date mentioned in the message ("tomorrow", "friday", "sep 25", "2026-09-25"), or null. */
export function parseRequestedDate(q: string, now: Date): Date | null {
  const today = startOfDay(now);
  if (test(q, /\b(today|tonight)\b/)) return today;
  if (test(q, /\b(tomorrow|tmrw)\b/)) return addDays(today, 1);

  const valid = (year: number, month: number, day: number): Date | null => {
    const d = new Date(year, month, day);
    return d.getMonth() === month && d.getDate() === day ? d : null;
  };
  const upcoming = (month: number, day: number): Date | null => {
    const d = valid(today.getFullYear(), month, day);
    if (!d) return null;
    return d < today ? valid(today.getFullYear() + 1, month, day) : d;
  };

  const iso = q.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return valid(+iso[1], +iso[2] - 1, +iso[3]);

  const monthFirst = q.match(
    new RegExp(`\\b(${MONTHS.join('|')})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`),
  );
  if (monthFirst) return upcoming(MONTHS.indexOf(monthFirst[1]), +monthFirst[2]);

  const dayFirst = q.match(
    new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS.join('|')})[a-z]*\\b`),
  );
  if (dayFirst) return upcoming(MONTHS.indexOf(dayFirst[2]), +dayFirst[1]);

  for (const [re, day] of WEEKDAY_WORDS) {
    if (test(q, re)) return addDays(today, (day - today.getDay() + 7) % 7 || 7);
  }
  return null;
}

function freeTimes(dateKey: string, taken: ReadonlySet<string>): string[] {
  return BOOKING_SLOTS.filter((time) => !taken.has(slotId(dateKey, time)));
}

function timesText(times: readonly string[], max = 4): string {
  const shown = times.slice(0, max).map(formatTime).join(', ');
  return times.length > max ? `${shown} +${times.length - max} more` : shown;
}

/** The next dates (from the earliest bookable day) that are open and still have a free slot. */
function nextOpenDates(ctx: AssistantContext, count: number): { date: Date; times: string[] }[] {
  const found: { date: Date; times: string[] }[] = [];
  const first = firstBookableDate(ctx.now);
  for (let i = 0; i <= BOOKING_HORIZON_DAYS && found.length < count; i++) {
    const date = addDays(first, i);
    if (!isOpenDate(date, ctx.now)) continue;
    const times = freeTimes(toDateKey(date), ctx.takenSlots);
    if (times.length) found.push({ date, times });
  }
  return found;
}

const SCHEDULE_FOLLOW_UPS = [
  'How do I book a service?',
  'What services do you offer?',
  "What's the status of my bookings?",
];

function hoursText(): string {
  const closed = CLOSED_WEEKDAYS.map(weekdayName).join(' and ');
  const times = BOOKING_SLOTS.map(formatTime);
  const last = times.pop();
  return (
    `Service appointments are every day except ${closed}, in hourly slots: ${times.join(', ')} and ${last} ` +
    `(lunch break 12:00–1:00 PM). Each slot takes one booking, and you can book from ` +
    `${plural(BOOKING_LEAD_DAYS, 'day')} ahead up to ${BOOKING_HORIZON_DAYS} days out.`
  );
}

function leadTimeReply(): AssistantReply {
  return {
    text:
      `You can book from ${plural(BOOKING_LEAD_DAYS, 'day')} ahead (no same-day bookings) up to ${BOOKING_HORIZON_DAYS} days out. ` +
      `${hoursText()}`,
    links: [MY_BOOKINGS],
    followUps: ['When is the next available slot?', 'How do I book a service?'],
  };
}

function hoursReply(): AssistantReply {
  return {
    text: hoursText(),
    links: [MY_BOOKINGS],
    followUps: ['When is the next available slot?', 'How do I book a service?'],
  };
}

function availabilityReply(q: string, ctx: AssistantContext): AssistantReply {
  const requested = parseRequestedDate(q, ctx.now);
  const links = [{ label: 'Pick a slot & book', url: '/customer/services' }];

  if (requested) {
    const key = toDateKey(requested);
    const label = longDayLabel(requested);
    const earliest = firstBookableDate(ctx.now);
    const next = nextOpenDates(ctx, 3);
    const nextText = next.length
      ? `\n\nNext openings:\n${bullets(next.map((n) => `${dayLabel(n.date)}: ${timesText(n.times)}`))}`
      : '';

    if (startOfDay(requested) < earliest) {
      return {
        text:
          `Bookings need at least ${plural(BOOKING_LEAD_DAYS, 'day')} of notice, so ${label} can't be booked online. ` +
          `The earliest date is ${longDayLabel(earliest)}.${nextText}`,
        links,
        followUps: SCHEDULE_FOLLOW_UPS,
      };
    }
    if (CLOSED_WEEKDAYS.includes(requested.getDay())) {
      return {
        text: `We don't take service appointments on ${weekdayName(requested.getDay())}s.${nextText}`,
        links,
        followUps: SCHEDULE_FOLLOW_UPS,
      };
    }
    if (!isOpenDate(requested, ctx.now)) {
      return {
        text: `${label} is outside the booking window: you can book up to ${BOOKING_HORIZON_DAYS} days ahead.${nextText}`,
        links,
        followUps: SCHEDULE_FOLLOW_UPS,
      };
    }
    const free = freeTimes(key, ctx.takenSlots);
    if (!free.length) {
      return {
        text: `${label} is fully booked.${nextText}`,
        links,
        followUps: SCHEDULE_FOLLOW_UPS,
      };
    }
    return {
      text:
        `${label} has ${plural(free.length, 'open slot')}: ${free.map(formatTime).join(', ')}.\n\n` +
        `Slots are first come, first served, so book soon to keep yours.`,
      links,
      followUps: SCHEDULE_FOLLOW_UPS,
    };
  }

  const next = nextOpenDates(ctx, 4);
  if (!next.length) {
    return {
      text: `I can't see any open slots in the next ${BOOKING_HORIZON_DAYS} days. Message our team and we'll help you find a time.`,
      links: [MESSAGES],
      followUps: ['What are your service hours?'],
    };
  }
  return {
    text:
      `Here are the next open days:\n${bullets(
        next.map((n) => `${dayLabel(n.date)}: ${timesText(n.times)}`),
      )}\n\n` + `Ask about a specific day, like "Is Friday available?", and I'll check it.`,
    links,
    followUps: [
      'Is tomorrow available?',
      'What are your service hours?',
      'How do I book a service?',
    ],
  };
}

// ─── bookings ──────────────────────────────────────────────────────────────────

const STATUS_WORDS: [RegExp, BookingStatus][] = [
  [/\bpending\b/, 'Pending'],
  [/\bconfirmed\b/, 'Confirmed'],
  [/\b(paid)\b/, 'Paid'],
  [/\b(completed|done|finished)\b/, 'Completed'],
  [/\b(cancelled|canceled)\b/, 'Cancelled'],
];

function nextStep(b: Booking): string {
  switch (b.status) {
    case 'Pending':
      return 'Staff are reviewing it. They will chat with you and send a quote.';
    case 'Confirmed':
      return `Quote ready${b.quote ? `: ${peso(b.quote.amount)}` : ''}. Pay it through PayMongo in My Bookings to lock it in.`;
    case 'Paid':
      return 'Payment received. Your slot is confirmed.';
    case 'Completed':
      return 'All done.';
    case 'Cancelled':
      return 'This booking was cancelled.';
  }
}

function bookingsReply(q: string, ctx: AssistantContext): AssistantReply {
  const filter = STATUS_WORDS.find(([re]) => test(q, re))?.[1];
  const all = ctx.bookings;
  if (!all.length) {
    return {
      text: "You don't have any service bookings yet. You can book one in a minute: pick a service, a date and a slot.",
      links: [{ label: 'Book a service', url: '/customer/services' }],
      followUps: ['What services do you offer?', 'When is the next available slot?'],
    };
  }

  const pool = filter ? all.filter((b) => b.status === filter) : all;
  if (!pool.length) {
    return {
      text: `You have no ${filter?.toLowerCase()} bookings. You have ${plural(all.length, 'booking')} in total.`,
      links: [MY_BOOKINGS],
      followUps: ["What's the status of my bookings?", 'When is the next available slot?'],
    };
  }

  const active = pool
    .filter((b) => ACTIVE_BOOKING_STATUSES.includes(b.status))
    .sort((a, b) =>
      `${a.preferredDate}${a.preferredTime}`.localeCompare(`${b.preferredDate}${b.preferredTime}`),
    );
  const past = pool.filter((b) => !ACTIVE_BOOKING_STATUSES.includes(b.status));
  // Active bookings are what people ask about; past ones only show when there is nothing active.
  const ordered = active.length ? active : past;
  const shown = ordered.slice(0, 3);

  const lines = shown.map(
    (b) =>
      `${b.serviceName}\n   ${formatSlot(b.preferredDate, b.preferredTime)} · ${b.status}\n   ↳ ${nextStep(b)}`,
  );
  const more = ordered.length - shown.length;
  const pastNote =
    active.length && past.length ? ` (${plural(past.length, 'past booking')} in My Bookings)` : '';
  const head = filter
    ? pool.length === 1
      ? `Your ${filter.toLowerCase()} booking:`
      : `Your ${pool.length} ${filter.toLowerCase()} bookings:`
    : active.length
      ? `You have ${plural(active.length, 'active booking')}${pastNote}:`
      : `You have no active bookings. Your latest:`;

  const chatTarget = shown.find(
    (b) => ACTIVE_BOOKING_STATUSES.includes(b.status) && b.conversationId,
  );
  const links: AssistantLink[] = [MY_BOOKINGS];
  if (chatTarget) {
    links.push({
      label: `Chat about ${chatTarget.serviceName}`,
      url: '/customer/messages',
      queryParams: { conversation: chatTarget.conversationId },
    });
  }
  return {
    text: `${head}\n\n${bullets(lines)}${more > 0 ? `\n\n+${more} more in My Bookings.` : ''}`,
    links,
    followUps: [
      'How do I pay for my booking?',
      'How do I reschedule a booking?',
      'When is the next available slot?',
    ],
  };
}

function firstActive(ctx: AssistantContext): Booking | undefined {
  return ctx.bookings.find((b) => ACTIVE_BOOKING_STATUSES.includes(b.status));
}

function chatLink(b: Booking | undefined): AssistantLink[] {
  return b?.conversationId
    ? [
        {
          label: `Open chat for ${b.serviceName}`,
          url: '/customer/messages',
          queryParams: { conversation: b.conversationId },
        },
      ]
    : [];
}

function cancelBookingReply(ctx: AssistantContext): AssistantReply {
  return {
    text:
      'Open My Bookings and press Cancel on the booking. You can cancel while it is Pending, or Confirmed as long as ' +
      "you haven't paid yet, and its time slot is freed right away.\n\n" +
      "If you've already paid, message staff in the booking's chat and they'll handle it.",
    links: [MY_BOOKINGS, ...chatLink(firstActive(ctx))],
    followUps: ['How do I reschedule a booking?', "What's the status of my bookings?"],
  };
}

function rescheduleReply(ctx: AssistantContext): AssistantReply {
  return {
    text:
      "Date changes are agreed in your booking's chat: tell staff the new date and time you'd like and they'll sort it out. " +
      'If you want to check what is open first, ask me "When is the next available slot?".',
    links: [...chatLink(firstActive(ctx)), MY_BOOKINGS],
    followUps: ['When is the next available slot?', 'How do I cancel a booking?'],
  };
}

function bookingPaymentReply(ctx: AssistantContext): AssistantReply {
  const awaiting = ctx.bookings.find(
    (b) => b.status === 'Confirmed' && b.payment?.status !== 'Paid',
  );
  const personal = awaiting
    ? `\n\nYou have a confirmed booking for ${awaiting.serviceName}${awaiting.quote ? ` with a quote of ${peso(awaiting.quote.amount)}` : ''}, ready to pay in My Bookings.`
    : '';
  return {
    text:
      "Once staff confirm your booking and send a quote, press Pay in My Bookings. You pay on PayMongo's secure page with GCash, Maya, a credit or debit card, GrabPay or QR Ph, " +
      'and the booking becomes Paid as soon as the payment goes through.' +
      personal,
    links: [MY_BOOKINGS],
    followUps: ["What's the status of my bookings?", 'How do I cancel a booking?'],
  };
}

// ─── services ──────────────────────────────────────────────────────────────────

const GENERIC_SERVICE_WORDS = new Set(['radio', 'service', 'services', 'system', 'on-site']);

function wordsOf(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** The service whose title the message talks about (matched on word stems, so "install" finds "Installation"). */
function findService(q: string, services: readonly Service[]): Service | undefined {
  const tokens = wordsOf(q).filter((t) => t.length >= 5);
  let best: Service | undefined;
  let bestScore = 0;
  for (const s of services) {
    const score = wordsOf(s.title)
      .filter((w) => w.length >= 5 && !GENERIC_SERVICE_WORDS.has(w))
      .filter((w) =>
        tokens.some((t) => t.startsWith(w.slice(0, 6)) || w.startsWith(t.slice(0, 6))),
      ).length;
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

function serviceDetailReply(service: Service): AssistantReply {
  return {
    text: `${service.title}: ${service.description}\n\nStarting at ${peso(service.price)}. Staff quote the final amount after you describe the job, and you only pay once you agree to it.`,
    links: [{ label: 'Book this service', url: '/customer/services' }],
    followUps: [
      'When is the next available slot?',
      'How do I book a service?',
      'What services do you offer?',
    ],
  };
}

function servicesReply(ctx: AssistantContext): AssistantReply {
  if (!ctx.services.length) {
    return {
      text: "I can't load the service list right now. You can still open the Services page or message our team.",
      links: [{ label: 'Open Services', url: '/customer/services' }, MESSAGES],
    };
  }
  return {
    text: `We offer ${plural(ctx.services.length, 'service')}:\n${bullets(
      ctx.services.map((s) => `${s.title}: from ${peso(s.price)}`),
    )}\n\nPrices are starting prices. Staff quote the final amount after you describe the job.`,
    links: [{ label: 'Book a service', url: '/customer/services' }],
    followUps: [
      'How do I book a service?',
      'When is the next available slot?',
      'Do you repair radios?',
    ],
  };
}

function howToBookReply(): AssistantReply {
  return {
    text:
      'Booking a service takes a few steps:\n' +
      bullets([
        'Open Services and pick the service you need',
        'Choose a date and an open time slot',
        'Describe the problem so staff can prepare',
        'Staff chat with you and send a quote',
        'Pay the quote through PayMongo (GCash, Maya, card and more)',
      ]) +
      `\n\n${hoursText()}`,
    links: [{ label: 'Book a service', url: '/customer/services' }],
    followUps: [
      'When is the next available slot?',
      'What services do you offer?',
      'How do I pay for my booking?',
    ],
  };
}

// ─── products ──────────────────────────────────────────────────────────────────

const CATEGORY_CUES: [RegExp, ProductCategory][] = [
  [
    /\b(accessor(?:y|ies)|batter(?:y|ies)|chargers?|earpieces?|earphones?|headsets?|microphones?|speaker ?mics?|holsters?|belt clips?|clips?)\b/g,
    'Radio Accessories',
  ],
  [/\b(antennas?|aerials?)\b/g, 'Antennas'],
  [/\b(repeaters?|base stations?|infrastructure|duplexers?|towers?)\b/g, 'Radio Infrastructure'],
  [
    /\b(marine|boats?|vessels?|ships?|public address|pa systems?|megaphones?|loudspeakers?)\b/g,
    'Marine & Public Address',
  ],
  [/\b(cctv|cameras?|surveillance|dvrs?|nvrs?)\b/g, 'CCTV'],
  [/\b(networking|network|routers?|wi-?fi|switch(?:es)?|access points?)\b/g, 'Networking'],
  [/\b(software|licen[sc]es?|cps)\b/g, 'Software & Licenses'],
  [/\b(radios?|walkie[- ]?talkies?|handhelds?|hand-held|portables?|two-way|2-way)\b/g, 'Radios'],
];

const STOP_WORDS = new Set(
  (
    'a an the is are was do does you your yours have has any some what which who where when how can could would ' +
    'please pls i me my we us want need looking look for find search show list give get buy purchase sell sells ' +
    'selling offer offers carry stock stocks available availability in on of to under below above over than less ' +
    'more with and or about tell recommend suggest best cheap cheapest cheaper affordable lowest low high highest ' +
    'expensive priciest premium budget price prices cost costs much product products item items catalog catalogue ' +
    'there that this it its at from up only just php peso pesos hi hello hey ok okay also new good great top ' +
    'popular brand brands model type kind options option thing things one ones category categories store shop ' +
    'sells selling out most least anything something everything whatever really very sort'
  ).split(' '),
);

interface ProductQuery {
  tokens: string[];
  category: ProductCategory | null;
  min: number | null;
  max: number | null;
  inStockOnly: boolean;
  sort: 'default' | 'price-asc' | 'price-desc';
}

/** "10k", "10,000", "₱ 5000.50" → number. */
function toAmount(digits: string, suffix?: string): number {
  const n = Number(digits.replace(/,/g, ''));
  return suffix ? n * 1000 : n;
}

const AMOUNT = String.raw`(?:₱|php|p)?\s*(\d[\d,]*(?:\.\d+)?)(?:\s*(k|thousand)\b)?`;

function parseProductQuery(q: string): ProductQuery {
  let rest = q;
  let min: number | null = null;
  let max: number | null = null;

  const between = new RegExp(String.raw`\bbetween\s+${AMOUNT}\s*(?:and|to|-)\s*${AMOUNT}`).exec(
    rest,
  );
  if (between) {
    min = toAmount(between[1], between[2]);
    max = toAmount(between[3], between[4]);
    rest = rest.replace(between[0], ' ');
  }
  const upper = new RegExp(
    String.raw`\b(?:under|below|less than|within|max(?:imum)?|up to|not more than|at most|budget(?: of| is)?)\s*${AMOUNT}`,
  ).exec(rest);
  if (upper) {
    max = toAmount(upper[1], upper[2]);
    rest = rest.replace(upper[0], ' ');
  }
  const lower = new RegExp(
    String.raw`\b(?:above|over|more than|at least|min(?:imum)?|starting (?:at|from))\s*${AMOUNT}`,
  ).exec(rest);
  if (lower) {
    min = toAmount(lower[1], lower[2]);
    rest = rest.replace(lower[0], ' ');
  }
  if (min !== null && max !== null && min > max) [min, max] = [max, min];

  // The first matching cue is the most specific ("radio accessories" beats "radios"); every cue's words are
  // then removed so they don't linger as search terms.
  let category: ProductCategory | null = null;
  for (const [re, cat] of CATEGORY_CUES) {
    if (test(rest, new RegExp(re.source))) {
      category ??= cat;
      rest = rest.replace(re, ' ');
    }
  }
  if (category) {
    const categoryWords = new Set(wordsOf(category));
    rest = rest
      .split(/\s+/)
      .filter((w) => !categoryWords.has(w.replace(/[^a-z]/g, '')))
      .join(' ');
  }

  const sort = test(q, /\b(cheap|cheapest|lowest|affordable|inexpensive|lowest[- ]priced)\b/)
    ? 'price-asc'
    : test(q, /\b(expensive|priciest|highest|premium|top[- ]?end|high[- ]end)\b/)
      ? 'price-desc'
      : 'default';

  const tokens = (rest.match(/[a-z0-9][a-z0-9.-]*/g) ?? [])
    .filter((t) => !STOP_WORDS.has(t) && !/^\d+$/.test(t) && !/^(k|p)$/.test(t))
    .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));

  return {
    tokens,
    category,
    min,
    max,
    inStockOnly: test(q, /\b(in stock|on hand|in-stock)\b/),
    sort,
  };
}

function haystack(p: Product): string {
  return [p.name, p.brand, p.model, p.subcategory, ...p.searchKeywords].join(' ').toLowerCase();
}

function searchProducts(query: ProductQuery, products: readonly Product[]): Product[] {
  let list = products.filter((p) => {
    if (query.category && p.category !== query.category) return false;
    if (query.inStockOnly && !p.inStock) return false;
    if (query.min !== null && (p.price === null || p.price < query.min)) return false;
    if (query.max !== null && (p.price === null || p.price > query.max)) return false;
    return true;
  });
  if (query.tokens.length) {
    list = list.filter((p) => {
      const text = haystack(p);
      return query.tokens.every((t) => text.includes(t));
    });
  }

  const priced = (p: Product) => p.price ?? Number.POSITIVE_INFINITY;
  const byStock = (a: Product, b: Product) => Number(b.inStock) - Number(a.inStock);
  if (query.sort === 'price-asc')
    return [...list].sort((a, b) => priced(a) - priced(b) || byStock(a, b));
  if (query.sort === 'price-desc') {
    return [...list].sort((a, b) => {
      const pa = a.price ?? -1;
      const pb = b.price ?? -1;
      return pb - pa || byStock(a, b);
    });
  }
  return [...list].sort(byStock);
}

function describeFilters(query: ProductQuery): string {
  const parts: string[] = [];
  if (query.tokens.length) parts.push(`"${query.tokens.join(' ')}"`);
  if (query.category) parts.push(query.category);
  if (query.min !== null && query.max !== null) parts.push(`${peso(query.min)}–${peso(query.max)}`);
  else if (query.max !== null) parts.push(`under ${peso(query.max)}`);
  else if (query.min !== null) parts.push(`over ${peso(query.min)}`);
  if (query.inStockOnly) parts.push('in stock');
  return parts.join(' · ');
}

function catalogLink(query: ProductQuery, label: string): AssistantLink {
  const queryParams: Record<string, string | number> = {};
  if (query.tokens.length) queryParams['q'] = query.tokens.join(' ');
  if (query.category) queryParams['category'] = query.category;
  if (query.min !== null) queryParams['min'] = query.min;
  if (query.max !== null) queryParams['max'] = query.max;
  if (query.inStockOnly) queryParams['stock'] = 1;
  // The catalog only applies filters when at least one of these keys exists.
  if (!Object.keys(queryParams).length) queryParams['category'] = 'All';
  return { label, url: '/customer/catalog', queryParams };
}

function categoryFollowUps(products: readonly Product[], skip?: ProductCategory | null): string[] {
  const counts = new Map<ProductCategory, number>();
  for (const p of products) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  return PRODUCT_CATEGORIES.filter((c) => counts.has(c) && c !== skip)
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
    .slice(0, 3)
    .map((c) => `Show me ${c.toLowerCase()}`);
}

function overviewReply(ctx: AssistantContext): AssistantReply {
  const counts = new Map<ProductCategory, number>();
  for (const p of ctx.products) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  if (!counts.size) {
    return {
      text: 'The catalog is empty or still loading. Give it a moment, or open the catalog page directly.',
      links: [CATALOG],
    };
  }
  const lines = PRODUCT_CATEGORIES.filter((c) => counts.has(c)).map(
    (c) => `${c}: ${plural(counts.get(c) ?? 0, 'product')}`,
  );
  return {
    text:
      `We have ${plural(ctx.products.length, 'product')} across ${plural(counts.size, 'category', 'categories')}:\n${bullets(lines)}\n\n` +
      `Tell me what you're after (a brand, a category or a budget), like "Kenwood radios under ₱15,000".`,
    links: [CATALOG],
    followUps: [...categoryFollowUps(ctx.products), 'Recommend a radio for security guards'].slice(
      0,
      4,
    ),
  };
}

function productReply(query: ProductQuery, ctx: AssistantContext): AssistantReply {
  let results = searchProducts(query, ctx.products);
  let closest = false;
  // "Marine radio", "kenwood earpiece": when the extra words match nothing, fall back to the category or budget.
  if (
    !results.length &&
    query.tokens.length &&
    (query.category || query.min !== null || query.max !== null)
  ) {
    results = searchProducts({ ...query, tokens: [] }, ctx.products);
    closest = results.length > 0;
  }
  const filters = describeFilters(closest ? { ...query, tokens: [] } : query);

  if (!results.length) {
    let hint = '';
    if (query.category && (query.max !== null || query.min !== null)) {
      const prices = ctx.products
        .filter((p) => p.category === query.category && p.price !== null)
        .map((p) => p.price as number);
      if (prices.length) {
        hint = ` ${query.category} start at ${peso(Math.min(...prices))} and go up to ${peso(Math.max(...prices))}.`;
      }
    }
    return {
      text: `I couldn't find any products for ${filters || 'that'}.${hint} Try a different brand, a wider budget, or ask our team. They can source items that aren't listed.`,
      links: [
        catalogLink(
          { ...query, min: null, max: null, tokens: [], inStockOnly: false },
          'Browse everything',
        ),
        MESSAGES,
      ],
      followUps: categoryFollowUps(ctx.products, query.category).slice(0, 3),
    };
  }

  const top = results.slice(0, 3);
  const onlyStock =
    query.inStockOnly &&
    !query.tokens.length &&
    !query.category &&
    query.min === null &&
    query.max === null;
  const head = onlyStock
    ? `${plural(results.length, 'product')} ${results.length === 1 ? 'is' : 'are'} in stock right now.`
    : closest
      ? `I couldn't find an exact match for "${query.tokens.join(' ')}", but here ${results.length === 1 ? 'is the closest' : 'are the closest'}: ${filters}.`
      : filters
        ? `I found ${plural(results.length, 'match', 'matches')} for ${filters}.`
        : `Here are some products.`;
  const sorted =
    query.sort === 'price-asc'
      ? ' Cheapest first:'
      : query.sort === 'price-desc'
        ? ' Highest price first:'
        : '';
  const onRequest = top.some((p) => p.price === null)
    ? '\n\nItems marked "Price on request" need a quote. Message our team.'
    : '';

  return {
    text: `${head}${sorted}${onRequest}`,
    products: top,
    links: [
      catalogLink(
        query,
        results.length > top.length ? `See all ${results.length} in catalog` : 'Open in catalog',
      ),
    ],
    followUps: categoryFollowUps(ctx.products, query.category)
      .slice(0, 2)
      .concat(['Recommend a radio for security guards']),
  };
}

const USE_CASES: {
  re: RegExp;
  who: string;
  advice: string;
  category: ProductCategory;
  followUps: string[];
}[] = [
  {
    re: /\b(security|guards?|mall|building|condo|subdivision|village)\b/,
    who: 'security guards and building teams',
    advice:
      'Compact handheld radios with earpieces work well for guards on patrol. Plan on spare batteries and a multi-unit charger so every shift starts full, and choose UHF if the site is mostly indoors.',
    category: 'Radios',
    followUps: ['Show me radio accessories', 'What is your cheapest radio?'],
  },
  {
    re: /\b(construction|warehouse|factory|plant|manufacturing|site|quarry|mining)\b/,
    who: 'construction sites and warehouses',
    advice:
      'Go for durable handheld radios with strong batteries. For a wide site or several buildings, add a repeater and antenna so signals reach everyone.',
    category: 'Radios',
    followUps: ['Show me radio infrastructure', 'Show me antennas'],
  },
  {
    re: /\b(hotel|resort|restaurant|cafe|retail|school|church|events?|hospitality|staff)\b/,
    who: 'hotels, restaurants and events',
    advice:
      'Lightweight handhelds with discreet earpieces or speaker mics keep staff connected without disturbing guests.',
    category: 'Radios',
    followUps: ['Show me radio accessories', 'Show me radios under ₱10,000'],
  },
  {
    re: /\b(marine|boats?|vessels?|ships?|fishing|yacht|port)\b/,
    who: 'boats and vessels',
    advice:
      'Our Marine & Public Address range covers ship-to-shore communication and loudspeaker needs.',
    category: 'Marine & Public Address',
    followUps: ['Show me antennas', 'How do I book a service?'],
  },
  {
    re: /\b(large area|wide area|far|long range|coverage|multiple (?:buildings|floors)|campus|farm|repeater)\b/,
    who: 'wide-area coverage',
    advice:
      'To cover a large site you usually want a repeater to extend range, plus the right antenna. Staff can design it with you.',
    category: 'Radio Infrastructure',
    followUps: ['Show me antennas', 'How much is system design?'],
  },
  {
    re: /\b(cctv|surveillance|camera|cameras|monitoring)\b/,
    who: 'video surveillance',
    advice: 'Our CCTV range covers cameras and recording gear. We also install on-site.',
    category: 'CCTV',
    followUps: ['How much is on-site installation?', 'Show me networking'],
  },
];

const USE_CASE_PROMPTS = [
  'Recommend a radio for security guards',
  'Recommend a radio for a construction site',
  'Recommend a radio for a hotel or restaurant',
  'Recommend something for a large area',
];

function recommendReply(q: string, ctx: AssistantContext): AssistantReply {
  const useCase = USE_CASES.find((u) => test(q, u.re));
  if (!useCase) {
    return {
      text: 'Happy to recommend something. What will you use it for, and roughly what budget do you have?',
      followUps: [...USE_CASE_PROMPTS.slice(0, 3), 'What products do you sell?'],
      links: [MESSAGES],
    };
  }
  const budget = parseProductQuery(q);
  const query: ProductQuery = {
    tokens: [],
    category: useCase.category,
    min: budget.min,
    max: budget.max,
    inStockOnly: true,
    sort: budget.sort,
  };
  const results = searchProducts(query, ctx.products).slice(0, 3);
  const noStock = results.length === 0;
  return {
    text:
      `For ${useCase.who}: ${useCase.advice}` +
      (noStock
        ? `\n\nI don't see ${useCase.category} in stock right now. Message our team and they'll check for you.`
        : `\n\nIn stock right now:`),
    products: results,
    links: [
      catalogLink({ ...query, inStockOnly: false }, `Browse ${useCase.category}`),
      { label: 'Ask our team to help choose', url: '/customer/messages' },
    ],
    followUps: useCase.followUps,
  };
}

// ─── orders, cart, account ─────────────────────────────────────────────────────

function ordersReply(ctx: AssistantContext): AssistantReply {
  const orders = [...ctx.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!orders.length) {
    return {
      text: "I don't see any orders on your account yet. Once you check out, you can follow each order here and in My Orders.",
      links: [CATALOG, MY_ORDERS],
      followUps: ['How much is shipping?', 'What payment methods do you accept?'],
    };
  }
  const lines = orders.slice(0, 3).map((o) => {
    const eta =
      o.estimatedDelivery && o.status !== 'Delivered' && o.status !== 'Cancelled'
        ? ` · est. delivery ${new Date(`${o.estimatedDelivery}T00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`
        : '';
    return `${o.code} · ${o.status} · ${peso(o.total)}${eta}`;
  });
  const more = orders.length - 3;
  return {
    text:
      `${orders.length === 1 ? 'Your order' : `Your latest ${Math.min(orders.length, 3)} orders`}:\n${bullets(lines)}${more > 0 ? `\n\n+${more} more in My Orders.` : ''}\n\n` +
      'Orders go Pending → Processing → Shipped → Delivered.',
    links: [MY_ORDERS],
    followUps: [
      'How much is shipping?',
      'What payment methods do you accept?',
      'What is your return policy?',
    ],
  };
}

function shippingReply(ctx: AssistantContext): AssistantReply {
  return {
    text:
      `We ship across the Philippines for a flat ${peso(ctx.flatShippingFee)} per order, no matter how many items. ` +
      'Each order shows an estimated delivery date once it is placed.',
    links: [MY_ORDERS],
    followUps: ['What payment methods do you accept?', 'Where is my order?'],
  };
}

function orderPaymentReply(): AssistantReply {
  return {
    text:
      "All payments go through PayMongo's secure checkout: GCash, Maya, credit or debit card, GrabPay or QR Ph. " +
      'Your order is confirmed as soon as the payment goes through; unpaid orders are cancelled after an hour. We do not offer Cash on Delivery.\n\n' +
      'Service bookings work the same way, after staff confirm and quote the job.',
    links: [{ label: 'Go to cart', url: '/customer/cart' }],
    followUps: ['How much is shipping?', 'How do I pay for my booking?'],
  };
}

function cartReply(ctx: AssistantContext): AssistantReply {
  const { items, subtotal, shippingFee, total } = ctx.cart;
  if (!items.length) {
    return {
      text: 'Your cart is empty. Tell me what you need and I will find it.',
      links: [CATALOG],
      followUps: ['What products do you sell?', 'Which products are in stock?'],
    };
  }
  const units = items.reduce((n, i) => n + i.qty, 0);
  const lines = items.slice(0, 5).map((i) => `${i.qty} × ${i.name}: ${peso(i.price * i.qty)}`);
  return {
    text:
      `You have ${plural(units, 'item')} in your cart:\n${bullets(lines)}${items.length > 5 ? `\n+${items.length - 5} more` : ''}\n\n` +
      `Subtotal ${peso(subtotal)} + shipping ${peso(shippingFee)} = ${peso(total)}.`,
    links: [
      { label: 'View cart', url: '/customer/cart' },
      { label: 'Checkout', url: '/customer/checkout' },
    ],
    followUps: ['What payment methods do you accept?', 'How much is shipping?'],
  };
}

function checkoutReply(ctx: AssistantContext): AssistantReply {
  return {
    text:
      "To check out: add items to your cart, open the cart, then Checkout. Pick a saved shipping address (or add one) and press Pay. You finish on PayMongo's secure page (GCash, Maya, card, GrabPay or QR Ph)." +
      (ctx.cart.items.length
        ? `\n\nYour cart is ready with ${plural(ctx.cart.items.length, 'product')}.`
        : ''),
    links: [{ label: 'Go to cart', url: '/customer/cart' }],
    followUps: [
      'What payment methods do you accept?',
      'How much is shipping?',
      "What's in my cart?",
    ],
  };
}

function favoritesReply(ctx: AssistantContext): AssistantReply {
  return {
    text: ctx.favoritesCount
      ? `You have ${plural(ctx.favoritesCount, 'favorite')} saved. Tap the heart on any product to add or remove one.`
      : "You haven't saved any favorites yet. Tap the heart on any product to keep it for later.",
    links: [
      {
        label: ctx.favoritesCount ? 'Open favorites' : 'Browse the catalog',
        url: ctx.favoritesCount ? '/customer/favorites' : '/customer/catalog',
      },
    ],
    followUps: ["What's in my cart?", 'What products do you sell?'],
  };
}

function accountReply(q: string): AssistantReply {
  if (test(q, /\b(address|addresses)\b/)) {
    return {
      text: 'You can add, edit or remove shipping addresses in My Addresses (user menu, top-right). Saved addresses make checkout faster.',
      links: [{ label: 'Open My Addresses', url: '/customer/addresses' }],
      followUps: ['How do I checkout?', 'How much is shipping?'],
    };
  }
  if (test(q, /\b(password|security|login|log in|sign in|code|otp)\b/)) {
    return {
      text: 'Change your password under Settings → Account Security. Each sign-in also needs a 6-digit code we email you. Forgot your password? Use "Forgot password?" on the sign-in page.',
      links: [{ label: 'Open Account Security', url: '/customer/settings/security' }],
      followUps: ['How do I update my address?', 'I want to talk to a human'],
    };
  }
  // Disabled while the Notifications settings page is switched off (see settings.routes.ts).
  // if (test(q, /\b(notification|notifications)\b/)) {
  //   return {
  //     text: 'Choose which updates you receive under Settings → Notifications.',
  //     links: [{ label: 'Open Notifications', url: '/customer/settings/notifications' }],
  //     followUps: ['How do I update my address?'],
  //   };
  // }
  return {
    text: 'Manage your account and profile picture under Settings → Profile. Shipping addresses have their own page in the user menu.',
    links: [
      { label: 'Open Profile settings', url: '/customer/settings/profile' },
      { label: 'Open My Addresses', url: '/customer/addresses' },
    ],
    followUps: ['How do I update my address?', 'I want to talk to a human'],
  };
}

// ─── conversational ────────────────────────────────────────────────────────────

function capabilitiesReply(): AssistantReply {
  return {
    text:
      'I can help you with:\n' +
      bullets([
        'Finding products by name, brand, category or budget, and recommending radios for your use',
        'Checking open booking dates, time slots and service hours',
        'Following up on your service bookings: status, payment, cancelling and rescheduling',
        'Service prices and how to book',
        'Your orders, cart, favorites, shipping and payment options',
        'Account questions, or connecting you with our team',
      ]),
    followUps: [
      'Show me radios under ₱20,000',
      'When is the next available slot?',
      "What's the status of my bookings?",
    ],
  };
}

function humanReply(ctx: AssistantContext): AssistantReply {
  return {
    text:
      'Our team is happy to help. Send them a message and they will reply in your Messages inbox.' +
      (firstActive(ctx)
        ? ' For an existing booking, the chat on that booking is the quickest way.'
        : ''),
    links: [MESSAGES, ...chatLink(firstActive(ctx))],
    followUps: ['What can you help me with?'],
  };
}

function returnsReply(): AssistantReply {
  return {
    text:
      "I don't have IOTEL's returns, warranty or refund policy on hand and I don't want to guess. " +
      "Message our team with your order number and the product, and they'll confirm what applies.",
    links: [MESSAGES, MY_ORDERS],
    followUps: ['Where is my order?', 'I want to talk to a human'],
  };
}

function aboutReply(): AssistantReply {
  return {
    text: 'IOTEL is the online store and service desk of Goldcomm Corporation, your source for two-way radios, accessories, antennas, infrastructure, marine and PA gear, CCTV and networking, plus installation and repair services.',
    links: [{ label: 'About IOTEL', url: '/customer/about' }],
    followUps: ['What products do you sell?', 'What services do you offer?'],
  };
}

function fallbackReply(): AssistantReply {
  return {
    text: "I'm not sure I got that. I can look up products, check open booking slots, follow your bookings and orders, or connect you with our team. Try one of these:",
    followUps: [
      'What products do you sell?',
      'When is the next available slot?',
      "What's the status of my bookings?",
      'What can you help me with?',
    ],
    links: [MESSAGES],
  };
}

export function welcomeReply(ctx: Pick<AssistantContext, 'firstName'>): AssistantReply {
  return {
    text: `Hi${ctx.firstName ? ` ${ctx.firstName}` : ''}! I'm the IOTEL Assistant. I can help you find products, check open booking slots, follow your bookings and orders, and more. Pick a topic below or just ask.`,
  };
}

// ─── entry point ───────────────────────────────────────────────────────────────

const BOOKING_WORDS =
  /\b(booking|bookings|appointment|appointments|reservation|book|reserve|service request)\b/;
const SCHEDULE_WORDS =
  /\b(slot|slots|schedule|schedules|availability|available|vacan\w*|free|open|opening|openings|earliest|next)\b/;

/** The reply to whatever the customer typed or tapped. */
export function answer(input: string, ctx: AssistantContext): AssistantReply {
  const q = input.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  if (!q) return fallbackReply();

  const bookingCue = test(q, BOOKING_WORDS);
  const dateMentioned = parseRequestedDate(q, ctx.now) !== null;

  // Small talk (only when that is all the message is)
  if (test(q, /^(hi|hello|hey|good (morning|afternoon|evening)|yo|hola|kumusta)\b[\s!.,?]*$/)) {
    return {
      ...welcomeReply(ctx),
      followUps: [
        'What can you help me with?',
        'What products do you sell?',
        'When is the next available slot?',
      ],
    };
  }
  if (test(q, /^(thanks|thank you|ty|salamat|thx|ok thanks|okay thanks)\b/)) {
    return {
      text: "You're welcome! Anything else I can help with?",
      followUps: ['What can you help me with?', 'What products do you sell?'],
    };
  }
  if (test(q, /^(bye|goodbye|see you|that's all|that is all|no thanks)\b/)) {
    return { text: "Thanks for stopping by! I'm here whenever you need me." };
  }

  // Humans and policy questions
  if (
    test(
      q,
      /\b(human|agent|representative|support|sales ?(rep|team)?|talk to|speak to|contact|call you|complaint)\b/,
    ) &&
    !bookingCue &&
    !test(q, /\bservice hours\b/)
  ) {
    return humanReply(ctx);
  }
  if (
    test(q, /\b(return|returns|refund|refunds|warranty|exchange|replacement|defective|damaged)\b/)
  )
    return returnsReply();
  if (
    test(
      q,
      /\b(what can you (do|help)|what do you do|capabilities|how can you help|what else can you)\b|^help[\s?!.]*$/,
    ) &&
    !bookingCue
  ) {
    return capabilitiesReply();
  }
  if (test(q, /\b(about (iotel|goldcomm|you|the company)|who are you|goldcomm|company)\b/))
    return aboutReply();

  // Bookings
  if (bookingCue && test(q, /\b(cancel|cancellation)\b/)) return cancelBookingReply(ctx);
  if (
    test(
      q,
      /\b(reschedule|re-schedule|change (the |my )?(date|time|schedule|slot)|move (my|the) (booking|appointment)|postpone)\b/,
    )
  )
    return rescheduleReply(ctx);
  if (
    (bookingCue || test(q, /\bservice\b/)) &&
    test(q, /\b(pay|payment|gcash|maya|paymongo|quote|quotation)\b/)
  )
    return bookingPaymentReply(ctx);
  if (
    test(
      q,
      /\b(service hours|business hours|opening hours|store hours|operating hours|what time (do|are) you|when are you open|are you open|hours)\b/,
    )
  )
    return hoursReply();
  if (
    test(q, /\b(how (far|early|soon)|advance|notice|lead time|how many days)\b/) &&
    (bookingCue || SCHEDULE_WORDS.test(q))
  )
    return leadTimeReply();
  if (
    (test(q, SCHEDULE_WORDS) &&
      (bookingCue ||
        dateMentioned ||
        test(q, /\b(slot|slots|schedule|availability|openings?|when can)\b/))) ||
    (dateMentioned && (test(q, /\b(available|free|open|book)\b/) || q.split(' ').length <= 4))
  ) {
    return availabilityReply(q, ctx);
  }
  if (
    bookingCue &&
    test(
      q,
      /\b(my|mine|status|check|track|upcoming|pending|confirmed|completed|cancelled|canceled|paid|do i have|latest|update)\b/,
    ) &&
    !test(q, /\b(how do i|how to|how can i)\b/)
  ) {
    return bookingsReply(q, ctx);
  }
  if (
    test(
      q,
      /\bhow\b.*\bbook\b|\b(make|set|schedule|create) (a |an )?(booking|appointment|service)\b|\bbook (a|an|my|the)? ?(service|appointment|repair|installation|technician)\b/,
    )
  )
    return howToBookReply();

  // Services
  const wantsProduct = test(q, /\b(software|licen[sc]e|cps)\b/);
  const service = wantsProduct ? undefined : findService(q, ctx.services);
  if (service) return serviceDetailReply(service);
  if (
    test(
      q,
      /\b(services?|repair|repairs|install|installation|technician|maintenance|what do you offer)\b/,
    ) &&
    !test(q, /\b(product|products|price of)\b/)
  ) {
    return servicesReply(ctx);
  }

  // Shopping
  if (
    test(
      q,
      /\b(shipping|delivery (fee|charge|cost|time)|free (shipping|delivery)|how long.*(deliver|ship|arrive)|do you ship)\b/,
    )
  )
    return shippingReply(ctx);
  if (test(q, /\bhow\b.*\b(order|buy|purchase)\b/)) return checkoutReply(ctx);
  if (
    test(q, /\b(order|orders|tracking|track|delivered|parcel|package|shipment|purchase history)\b/)
  )
    return ordersReply(ctx);
  if (
    test(
      q,
      /\b(pay|payment|payments|paymongo|gcash|maya|paymaya|credit card|debit card|grabpay|qr ph|bank transfer|cash on delivery|cod)\b/,
    )
  )
    return orderPaymentReply();
  if (test(q, /\b(checkout|check out)\b/)) return checkoutReply(ctx);
  if (test(q, /\b(cart|basket)\b/)) return cartReply(ctx);
  if (test(q, /\b(favou?rites?|wishlist|liked|saved items?)\b/)) return favoritesReply(ctx);
  if (
    test(
      q,
      /\b(address|addresses|profile|password|account|settings|notifications?|my name|my email)\b/,
    )
  )
    return accountReply(q);

  // Recommendations and product search
  if (
    test(
      q,
      /\b(recommend|suggest|suggestion|best|ideal|which (radio|one)|what (radio|should i)|good for)\b/,
    )
  )
    return recommendReply(q, ctx);
  if (test(q, /^(products?|catalog|categories|shop|browse|items)\b[\s?!.]*$/))
    return overviewReply(ctx);

  const query = parseProductQuery(q);
  const productCue =
    query.category !== null ||
    query.max !== null ||
    query.min !== null ||
    query.inStockOnly ||
    query.sort !== 'default' ||
    test(
      q,
      /\b(product|products|item|items|sell|buy|price|prices|how much|cost|brand|model|looking for|find|search|show|do you have|have any|carry|stock|available)\b/,
    );

  if (productCue) {
    if (
      !query.category &&
      !query.tokens.length &&
      query.max === null &&
      query.min === null &&
      !query.inStockOnly &&
      query.sort === 'default'
    ) {
      return overviewReply(ctx);
    }
    return productReply(query, ctx);
  }

  // Last resort: a bare brand or model name ("kenwood", "kmc30") that matches the catalog.
  if (query.tokens.length && query.tokens.every((t) => t.length >= 3)) {
    const hits = searchProducts(query, ctx.products);
    if (hits.length) return productReply(query, ctx);
  }
  return fallbackReply();
}

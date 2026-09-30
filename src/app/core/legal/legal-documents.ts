/**
 * IOTEL's Terms of Service and Privacy Policy, written from what the app actually does (see CLAUDE.md for the flows).
 *
 * Both are DRAFTS until Goldcomm Corporation fills in every `confirm` block and a lawyer has reviewed them. When a
 * document's text changes, bump its version: the version a customer accepted is saved on their `users/{uid}` profile at
 * sign-up (`legalAcceptance`, see AuthService and firestore.rules).
 */

export type LegalDocumentId = 'terms' | 'privacy';

export type LegalBlock =
  /** A paragraph. */
  | { kind: 'p'; text: string }
  /** A sub-heading inside a section. */
  | { kind: 'h'; text: string }
  /** A bulleted list. */
  | { kind: 'list'; items: readonly string[] }
  /** Information Goldcomm Corporation still has to confirm or provide before the document is published. */
  | { kind: 'confirm'; text: string };

export interface LegalSection {
  /** Anchor id, unique within the document. */
  id: string;
  title: string;
  blocks: readonly LegalBlock[];
}

export interface LegalDocument {
  id: LegalDocumentId;
  title: string;
  version: string;
  /** `YYYY-MM-DD`, or null while the effective date has not been set. */
  effectiveDate: string | null;
  /** Shows the "draft, pending confirmation" banner. Set to false only once every `confirm` block is resolved. */
  draft: boolean;
  intro: string;
  sections: readonly LegalSection[];
}

export const TERMS_VERSION = '1.0';
export const PRIVACY_VERSION = '1.0';

const CONTACT_CONFIRM =
  'Goldcomm Corporation to provide: registered business address, customer-support email address and telephone number, and business hours.';

export const TERMS_OF_SERVICE: LegalDocument = {
  id: 'terms',
  title: 'Terms of Service',
  version: TERMS_VERSION,
  effectiveDate: null,
  draft: true,
  intro:
    'These Terms explain the rules for using IOTEL, the online store and service-booking platform of Goldcomm Corporation for two-way radio equipment. Please read them before creating an account.',
  sections: [
    {
      id: 'acceptance',
      title: 'Acceptance of these Terms',
      blocks: [
        {
          kind: 'p',
          text: 'IOTEL is operated by Goldcomm Corporation ("Goldcomm", "we", "us"). By creating an account or using IOTEL, you agree to these Terms of Service. If you do not agree, please do not create an account or use IOTEL.',
        },
        {
          kind: 'p',
          text: 'Our Privacy Policy explains how we handle your personal information. When you register, we record which version of these Terms and of the Privacy Policy you accepted, and when.',
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to confirm its exact registered name, business address and SEC registration details as they should appear here.',
        },
      ],
    },
    {
      id: 'eligibility',
      title: 'Who May Use IOTEL',
      blocks: [
        {
          kind: 'p',
          text: 'IOTEL is intended for customers in the Philippines who want to buy two-way radio equipment and accessories, or book related technical services, from Goldcomm.',
        },
        {
          kind: 'p',
          text: 'You must be legally able to enter into a binding contract under Philippine law to place orders or book services. If you use IOTEL on behalf of a company or organization, you confirm that you are authorized to do so.',
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to confirm the minimum age for opening an account (for example, 18 years old) and whether business accounts need any additional details.',
        },
      ],
    },
    {
      id: 'account',
      title: 'Account Registration and Responsibilities',
      blocks: [
        {
          kind: 'p',
          text: 'To use the store you need an account. To register, you give your full name, your email address and a password (at least 8 characters, with at least one letter and one number). Accounts created through the public sign-up page are customer accounts. Staff and administrator accounts are created only by Goldcomm.',
        },
        { kind: 'p', text: 'You agree to:' },
        {
          kind: 'list',
          items: [
            'give your real name and an email address that you control;',
            'give accurate delivery addresses and mobile numbers when you order or book a service;',
            'use your account for yourself (or the organization you represent) and not share it with others;',
            'be responsible for the orders, bookings and messages made through your account.',
          ],
        },
        {
          kind: 'p',
          text: 'Your email address cannot be changed from within IOTEL. If you need to update it, contact us.',
        },
      ],
    },
    {
      id: 'security',
      title: 'Account Security',
      blocks: [
        {
          kind: 'p',
          text: 'Sign-in is handled by Firebase Authentication, a service of Google. Keep your password private and do not reuse a password you use elsewhere. Sign out when you use a shared or public device, because IOTEL keeps you signed in on that browser until you sign out.',
        },
        {
          kind: 'p',
          text: 'If you think someone else has used your account, or you can no longer sign in, contact us as soon as possible so we can help secure it.',
        },
        {
          kind: 'confirm',
          text: 'IOTEL does not currently offer an in-app password reset. Goldcomm Corporation to confirm how customers should request help with a forgotten password or a compromised account.',
        },
      ],
    },
    {
      id: 'products',
      title: 'Product Information, Prices and Availability',
      blocks: [
        {
          kind: 'p',
          text: 'We try to describe products and show prices accurately. Product photos are for illustration, and brand and model names belong to their respective owners.',
        },
        {
          kind: 'list',
          items: [
            'All prices are in Philippine pesos (₱).',
            'Some products are listed as "price on request". These cannot be ordered online; please message us for a quotation.',
            'Stock levels shown in the catalog are live but are not a reservation. Stock is set aside for your order only when our staff begin processing it.',
            'Prices can change. Your cart is updated to the current price, and checkout will tell you if a price changed or an item is no longer available before you place the order. The prices shown when you place the order are the prices of that order.',
          ],
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to confirm how it handles an order placed at a clearly mistaken price, and which product warranties (manufacturer or Goldcomm) apply.',
        },
      ],
    },
    {
      id: 'orders',
      title: 'Shopping Cart and Orders',
      blocks: [
        {
          kind: 'p',
          text: 'Your cart is kept only in the open browser tab. It is not saved to your account, so it is cleared if you reload the page, close the tab or sign out. You cannot add more of an item than is currently in stock.',
        },
        {
          kind: 'p',
          text: 'At checkout you choose a delivery address and a payment method and confirm the order. Each order gets an order number (for example, ORD-0007) and then moves through these stages, which you can follow under My Orders:',
        },
        {
          kind: 'list',
          items: [
            'Pending — the order has been placed and is waiting for payment verification (or, for Cash on Delivery, for our staff to start it).',
            'Processing — our staff are preparing the order. The items are taken out of stock at this point.',
            'Shipped — the order has been handed to a courier. The courier name, and a tracking number when there is one, are shown on the order.',
            'Delivered — the order has been received.',
            'Cancelled — the order was cancelled by you or by us (see Order Cancellation).',
          ],
        },
        {
          kind: 'p',
          text: 'If stock runs out before our staff can start processing your order, we will not be able to fulfil it and the order may be cancelled.',
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to confirm at which stage an order counts as accepted (for example, when processing starts), and whether there are order limits for individual or business customers.',
        },
      ],
    },
    {
      id: 'payment',
      title: 'Payment Methods and Verification',
      blocks: [
        {
          kind: 'p',
          text: 'IOTEL does not currently process online payments or connect to a payment gateway. The available methods are:',
        },
        {
          kind: 'list',
          items: [
            'GCash — you send the order total to the GCash account shown at checkout, then enter the reference number from your receipt.',
            'Bank Transfer — you transfer the order total to the bank account shown at checkout, then enter the reference number from your receipt.',
            'Cash on Delivery — you pay in cash when the order is delivered.',
          ],
        },
        {
          kind: 'p',
          text: 'Our staff check each GCash or bank transfer reference by hand. Until then the payment shows as "Submitted". If we cannot match your payment, we mark it "Rejected" and you can enter a correct reference number while the order is still Pending. An order paid by GCash or bank transfer is processed only after the payment is verified.',
        },
        {
          kind: 'p',
          text: "You must enter only reference numbers for payments you actually made to Goldcomm. Payments you make through GCash or your bank are also subject to that provider's own terms.",
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to provide its official GCash number and bank account details (the ones currently shown at checkout are placeholders), and to confirm whether an official receipt or sales invoice is issued and how.',
        },
      ],
    },
    {
      id: 'cancellation',
      title: 'Order Cancellation',
      blocks: [
        {
          kind: 'list',
          items: [
            'You can cancel your order yourself from My Orders while it is still Pending and before your payment has been verified.',
            'After your payment is verified or processing has started, please contact us through Messages if you need to cancel.',
            'Goldcomm may cancel an order that is Pending or Processing, for example when the items are out of stock or the payment cannot be verified. We may give a reason on the order.',
            'If a Processing order is cancelled, the items go back into stock.',
          ],
        },
      ],
    },
    {
      id: 'returns',
      title: 'Returns and Refunds',
      blocks: [
        {
          kind: 'p',
          text: 'IOTEL does not have an online returns or refunds feature. Requests about returns, replacements, defective items or refunds are handled by our staff; please contact us through Messages and include your order number.',
        },
        {
          kind: 'p',
          text: 'Nothing in these Terms limits the rights you have under Philippine law, including the Consumer Act of the Philippines (Republic Act No. 7394), for example in relation to defective products and warranties.',
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to provide its returns, replacement, warranty and refund policy: the time limits, which items qualify, who pays return shipping, and how and when money is refunded (including for a paid order that is later cancelled). Until then, IOTEL makes no promise of a refund.',
        },
      ],
    },
    {
      id: 'delivery',
      title: 'Delivery and Shipping',
      blocks: [
        {
          kind: 'list',
          items: [
            'A flat shipping fee of ₱250 is added to every order.',
            'We deliver to the address you choose at checkout. Please make sure it and the mobile number are correct and that someone can receive the order. The address cannot be changed in IOTEL once the order is placed.',
            'The estimated delivery date shown on your order is an estimate, not a guaranteed delivery date. Actual delivery depends on stock, payment verification, the courier and your location.',
            'When the order ships, we show the courier and, where available, a tracking number.',
          ],
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to confirm the areas it delivers to, the couriers it uses, what happens after a failed delivery attempt, and when ownership and risk of loss pass to the customer.',
        },
      ],
    },
    {
      id: 'services',
      title: 'Service Bookings',
      blocks: [
        {
          kind: 'p',
          text: 'You can book technical services (for example radio programming, repair, installation or consultation) from the Services page:',
        },
        {
          kind: 'list',
          items: [
            'You choose a service, a preferred date and an available time slot (Monday to Saturday), and describe what you need. The booking starts as Pending, and a chat thread with our staff is opened for it.',
            'The price shown for a service is a starting price. Our staff confirm the booking and give you a quotation, and may agree a different date or time with you in the chat.',
            'You pay the quoted amount by GCash or bank transfer and enter the reference number. Our staff verify it by hand before the booking is marked Paid, and mark it Completed when the work is done.',
            "You can cancel a booking yourself while it is Pending or Confirmed and before you have submitted a payment. After that, please contact us through the booking's chat.",
          ],
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to confirm the terms for on-site work (service area, travel fees, site access), what happens if a customer misses a booked slot, and refunds for paid bookings that are cancelled.',
        },
      ],
    },
    {
      id: 'messages',
      title: 'Messages and the IOTEL Assistant',
      blocks: [
        {
          kind: 'p',
          text: "Messages lets you chat with our staff about bookings and general questions. Messages cannot be edited or deleted after they are sent, and IOTEL also posts automatic updates in a booking's thread when its status changes. Please keep messages relevant and respectful.",
        },
        {
          kind: 'p',
          text: 'The IOTEL Assistant is an automated helper, not a person. It answers from the catalog, your bookings, orders and cart as they are shown in IOTEL, and its answers may be incomplete. The information on your order and booking pages, and what our staff tell you, is what counts.',
        },
      ],
    },
    {
      id: 'responsibilities',
      title: 'Customer Responsibilities',
      blocks: [
        {
          kind: 'list',
          items: [
            'Check your cart, delivery address and payment method before placing an order.',
            'Pay the exact amount shown and enter the correct reference number.',
            'Keep your mobile number reachable so the courier or our staff can contact you.',
            'Check your delivery when it arrives and tell us promptly about any problem.',
            'Use the radio equipment you buy in line with applicable laws and regulations, including any licensing or registration required by the National Telecommunications Commission.',
          ],
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to confirm whether it requires proof of an NTC licence or permit before selling or programming any regulated equipment.',
        },
      ],
    },
    {
      id: 'prohibited',
      title: 'Prohibited Activities',
      blocks: [
        { kind: 'p', text: 'When using IOTEL, you must not:' },
        {
          kind: 'list',
          items: [
            "register with false information or use another person's name, email or account;",
            'enter a payment reference number for a payment that you did not make, or that was not made to Goldcomm;',
            'place orders or book services you do not intend to honor, or deliberately occupy booking slots;',
            'send abusive, threatening, unlawful or spam messages to our staff;',
            "try to access other customers' information, staff or administrator features, or data you are not allowed to see;",
            'interfere with, overload, reverse-engineer or probe IOTEL or the systems behind it, or use automated tools to copy its content;',
            'use IOTEL for any unlawful purpose.',
          ],
        },
      ],
    },
    {
      id: 'termination',
      title: 'Account Suspension and Termination',
      blocks: [
        {
          kind: 'p',
          text: 'We may suspend or close an account, or cancel pending orders and bookings made with it, if it is used in breach of these Terms, for fraud, or where the law requires it. Where appropriate, we will tell you why.',
        },
        {
          kind: 'p',
          text: 'IOTEL does not have a "delete my account" button. To close your account, contact us. Our Privacy Policy explains what happens to your information.',
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to confirm its process for closing customer accounts on request and for suspending accounts, including any notice given to the customer.',
        },
      ],
    },
    {
      id: 'availability',
      title: 'Website Availability',
      blocks: [
        {
          kind: 'p',
          text: 'IOTEL relies on services provided by Google Firebase and on your internet connection. We aim to keep it available but cannot promise it will always be available, uninterrupted or error-free. We may change, add or remove features, and may take IOTEL offline for maintenance.',
        },
      ],
    },
    {
      id: 'ip',
      title: 'Intellectual Property',
      blocks: [
        {
          kind: 'p',
          text: 'The IOTEL name, the Goldcomm name and logo, and the design and content of IOTEL belong to Goldcomm Corporation or its licensors. Product names, brands and images belong to their respective manufacturers or owners. You may use IOTEL for your own shopping and service bookings, but you may not copy, republish or sell its content without our written permission.',
        },
      ],
    },
    {
      id: 'liability',
      title: 'Limitation of Liability',
      blocks: [
        {
          kind: 'p',
          text: 'To the extent allowed by Philippine law, Goldcomm is not responsible for losses caused by events outside our reasonable control, such as courier delays, outages of third-party services or of your internet connection, or by your own failure to keep your account secure. Nothing in these Terms excludes liability that cannot be excluded by law, or your rights as a consumer.',
        },
        {
          kind: 'confirm',
          text: "This clause should be reviewed by Goldcomm Corporation's legal counsel before publication.",
        },
      ],
    },
    {
      id: 'law',
      title: 'Governing Law and Disputes',
      blocks: [
        {
          kind: 'p',
          text: 'These Terms are governed by the laws of the Republic of the Philippines. If you have a concern, please contact us first so we can try to resolve it. You may also bring a complaint to the Department of Trade and Industry or another competent government agency.',
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to confirm the venue (city) for any court proceedings, as advised by its legal counsel.',
        },
      ],
    },
    {
      id: 'changes',
      title: 'Changes to these Terms',
      blocks: [
        {
          kind: 'p',
          text: 'We may update these Terms, for example when IOTEL changes or when the law requires it. The updated version will be published in IOTEL with a new version number and effective date. Changes do not apply to orders or bookings placed before the change. If you keep using IOTEL after an update, the updated Terms apply.',
        },
      ],
    },
    {
      id: 'contact',
      title: 'Contact Information',
      blocks: [
        {
          kind: 'p',
          text: 'If you have an account, the quickest way to reach us is through Messages in IOTEL. You can also contact Goldcomm Corporation using the details below.',
        },
        { kind: 'confirm', text: CONTACT_CONFIRM },
      ],
    },
  ],
};

export const PRIVACY_POLICY: LegalDocument = {
  id: 'privacy',
  title: 'Privacy Policy',
  version: PRIVACY_VERSION,
  effectiveDate: null,
  draft: true,
  intro:
    'This Privacy Policy explains what personal information IOTEL collects, why we collect it, who can see it and what your rights are under the Data Privacy Act of 2012 (Republic Act No. 10173).',
  sections: [
    {
      id: 'introduction',
      title: 'Introduction',
      blocks: [
        {
          kind: 'p',
          text: 'IOTEL is the online store and service-booking platform of Goldcomm Corporation ("Goldcomm", "we", "us"). Goldcomm is the personal information controller for the personal information processed through IOTEL. We process it in line with the Data Privacy Act of 2012, its Implementing Rules and Regulations, and the issuances of the National Privacy Commission (NPC).',
        },
        {
          kind: 'p',
          text: 'This policy covers the IOTEL web application only. It does not cover the GCash app, your bank, courier services or other websites, which have their own privacy policies.',
        },
      ],
    },
    {
      id: 'collected',
      title: 'Personal Information We Collect',
      blocks: [
        {
          kind: 'p',
          text: 'We collect only what you enter into IOTEL and what is created while you use it. The details are in the next four sections. In summary:',
        },
        {
          kind: 'list',
          items: [
            'Account information — your name, email address, profile photo (optional) and account records.',
            'Delivery details — names, addresses and mobile numbers you save or use at checkout.',
            'Order, booking and payment records — what you ordered or booked, amounts, payment method and reference numbers.',
            "Messages — what you and our staff write in IOTEL's chat.",
            'Favorites — the products you mark with a heart.',
          ],
        },
        {
          kind: 'p',
          text: 'IOTEL does not use analytics, advertising or tracking tools, does not ask for your location, and does not collect government ID numbers, card numbers or bank account numbers.',
        },
      ],
    },
    {
      id: 'account-info',
      title: 'Account Information',
      blocks: [
        {
          kind: 'list',
          items: [
            'Your full name and email address, which you give when you register.',
            "Your password. It is handled only by Firebase Authentication (Google's sign-in service) and is never stored in IOTEL's database or visible to our staff.",
            'Your account role (customer, staff or administrator), a unique account ID and the date the account was created.',
            'Your profile photo, if you choose to add one. It is resized to a small image and stored with your profile. You can change or remove it at any time.',
            'A record of the versions of the Terms of Service and this Privacy Policy you accepted when you registered, and the time you accepted them.',
          ],
        },
      ],
    },
    {
      id: 'order-info',
      title: 'Order, Delivery and Booking Information',
      blocks: [
        { kind: 'h', text: 'Saved addresses' },
        {
          kind: 'p',
          text: 'Recipient name, street address, city, province, ZIP code and mobile number for each address you save, and which one is your default. You can edit or delete saved addresses at any time.',
        },
        { kind: 'h', text: 'Orders' },
        {
          kind: 'p',
          text: 'Your name and email address, the products, quantities and prices, the shipping fee and total, a copy of the delivery address and mobile number, the payment details below, the estimated delivery date, the date and time of each status change, the courier and tracking number, and any cancellation reason.',
        },
        { kind: 'h', text: 'Service bookings' },
        {
          kind: 'p',
          text: 'The service, your preferred date and time slot, your name, email address and mobile number, your description of the problem or request, our quotation and your payment details.',
        },
        { kind: 'h', text: 'Messages and favorites' },
        {
          kind: 'p',
          text: "The content of chat messages, the sender's name and role, and when they were sent; and the products you add to your favorites.",
        },
      ],
    },
    {
      id: 'payment-info',
      title: 'Payment Information',
      blocks: [
        {
          kind: 'p',
          text: 'You pay by GCash or bank transfer outside IOTEL, or in cash on delivery. For each order or booking we record the payment method, the amount, the reference number you enter, when you submitted it, whether our staff verified or rejected it, and any reason for a rejection.',
        },
        {
          kind: 'p',
          text: 'We do not collect or store card numbers, bank account numbers, GCash PINs, one-time passwords or online banking credentials. Please never send them to us, including in chat.',
        },
      ],
    },
    {
      id: 'purpose',
      title: 'Why We Collect It and How We Use It',
      blocks: [
        { kind: 'p', text: 'We use your personal information only to:' },
        {
          kind: 'list',
          items: [
            'create and manage your account, sign you in and give you access to the right parts of IOTEL;',
            'show you the catalog, your cart, favorites, orders and bookings;',
            'process your orders: verify payments, prepare and ship the items, and keep track of stock;',
            'schedule, quote, carry out and follow up on the services you book;',
            'answer your questions and support requests through Messages;',
            'let our staff see order and sales totals needed to run the business;',
            'prevent misuse and fraud, such as false payment references;',
            'comply with our legal obligations and respond to lawful requests from authorities.',
          ],
        },
        {
          kind: 'p',
          text: 'We do not sell your personal information, use it for advertising, or make automated decisions about you that have legal or similarly significant effects. The IOTEL Assistant runs inside your browser: your questions to it are not sent to or saved by IOTEL.',
        },
        {
          kind: 'p',
          text: 'We process your information because it is necessary to provide the services you ask for under our contract with you, to meet legal obligations, and for our legitimate interest in running and protecting IOTEL (Section 12 of the Data Privacy Act). Your optional profile photo is processed because you chose to provide it.',
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to confirm with its Data Protection Officer or legal counsel the lawful bases listed above, and whether it plans to use customer data for any other purpose (for example, marketing), which would need to be added here and may require separate consent.',
        },
      ],
    },
    {
      id: 'storage',
      title: 'Firebase and Data Storage',
      blocks: [
        {
          kind: 'p',
          text: 'IOTEL is built on Google Firebase. Sign-in is handled by Firebase Authentication, and everything else described in this policy (profiles, addresses, favorites, orders, bookings, payment records and messages) is stored in Cloud Firestore, a Google cloud database. Google processes this information on our behalf as a service provider.',
        },
        {
          kind: 'p',
          text: "Google's servers may be located outside the Philippines. Where your information is stored or processed abroad, Goldcomm remains responsible for it under the Data Privacy Act.",
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to confirm the Cloud Firestore location selected for the project (visible in the Firebase Console), where the IOTEL website itself is hosted, and that its agreement with Google covers data processing.',
        },
      ],
    },
    {
      id: 'security-measures',
      title: 'Data Protection and Security',
      blocks: [
        { kind: 'p', text: 'The measures IOTEL uses to protect your information include:' },
        {
          kind: 'list',
          items: [
            "sign-in through Firebase Authentication, so passwords are never stored in IOTEL's database;",
            'database access rules that let a customer read and change only their own profile, addresses, favorites, orders, bookings and conversations;',
            'role-based access: staff and administrator features are available only to accounts that Goldcomm has given that role, and customers cannot change their own role;',
            'rules that stop customers from marking their own payments as paid, changing the amounts of an order after it is placed, or editing sent messages;',
            'connections between IOTEL and Firebase that use HTTPS.',
          ],
        },
        {
          kind: 'p',
          text: 'No system is completely secure. Please protect your password, sign out on shared devices and tell us immediately if you suspect unauthorized access to your account.',
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to confirm the organizational measures it applies (for example, staff confidentiality agreements, privacy training and who is given staff or administrator access).',
        },
      ],
    },
    {
      id: 'sharing',
      title: 'Who Can See Your Information',
      blocks: [
        {
          kind: 'list',
          items: [
            'You can see your own profile, addresses, favorites, orders, bookings and messages.',
            'Goldcomm staff and administrators can see all orders, bookings and conversations, including the names, email addresses, delivery addresses, mobile numbers and payment references in them, so that they can process and support them. Administrators can also see all account profiles.',
            'Couriers receive the name, delivery address and mobile number needed to deliver your order.',
            'Google, as our cloud service provider, stores and processes the information on our behalf.',
            'Government authorities, courts or regulators, when the law requires it.',
          ],
        },
        {
          kind: 'p',
          text: 'Other customers cannot see your information. When a time slot is taken, other customers see only that it is unavailable, not who booked it. We do not sell or rent your personal information.',
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to list the couriers or other third parties it shares customer information with, and whether data sharing or outsourcing agreements are in place with them.',
        },
      ],
    },
    {
      id: 'retention',
      title: 'Data Retention',
      blocks: [
        {
          kind: 'p',
          text: 'IOTEL does not delete information automatically. Your account, orders, bookings, payment records and messages are kept until Goldcomm deletes them. You can delete your saved addresses, favorites and profile photo yourself at any time. Orders, bookings and messages cannot be deleted from within IOTEL because they are business records.',
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to set and state how long it keeps each kind of record (accounts, orders and payment records, bookings, messages) and when it deletes or anonymizes them, taking into account tax and accounting record-keeping requirements. The Data Privacy Act requires that personal information be kept only as long as necessary.',
        },
      ],
    },
    {
      id: 'cookies',
      title: 'Cookies and Local Storage',
      blocks: [
        {
          kind: 'p',
          text: "IOTEL does not set its own cookies and does not use analytics or advertising cookies. It uses your browser's storage in these ways:",
        },
        {
          kind: 'list',
          items: [
            "Firebase Authentication saves your sign-in session in your browser's storage (IndexedDB) so that you stay signed in. Signing out removes it.",
            'Your cart is kept only in the memory of the open page and is not saved; it disappears when you reload or close the page.',
          ],
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to confirm whether the hosting provider for the IOTEL website sets any cookies of its own.',
        },
      ],
    },
    {
      id: 'rights',
      title: 'Your Privacy Rights',
      blocks: [
        { kind: 'p', text: 'Under the Data Privacy Act you have the right to:' },
        {
          kind: 'list',
          items: [
            'be informed about how your personal information is processed;',
            'access the personal information we hold about you;',
            'object to processing, and withdraw consent where processing is based on consent;',
            'have inaccurate or incomplete information corrected;',
            'have your information erased or blocked, where the law allows;',
            'obtain a copy of your information in an electronic format (data portability);',
            'be compensated for damages caused by unlawful processing;',
            'file a complaint with the National Privacy Commission (privacy.gov.ph).',
          ],
        },
        {
          kind: 'p',
          text: 'Some of this you can do yourself in IOTEL: view your orders, bookings and messages; add, edit or delete saved addresses; and change or remove your profile photo. For anything else, including changing your name or email address, contact us. We may need to confirm your identity before acting on a request.',
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to confirm how data subject requests are received and the time it takes to respond to them.',
        },
      ],
    },
    {
      id: 'deletion',
      title: 'Account Deletion and Data Removal',
      blocks: [
        {
          kind: 'p',
          text: 'IOTEL does not currently have a self-service option to delete your account. To ask for your account and personal information to be deleted, contact us. We will delete or anonymize what we no longer need, but we may keep records that the law requires us to keep, or that we need for pending orders, payments or disputes.',
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to confirm its account-deletion process and which records are kept after an account is deleted, and for how long.',
        },
      ],
    },
    {
      id: 'children',
      title: "Children's Privacy",
      blocks: [
        {
          kind: 'p',
          text: 'IOTEL is meant for adults and businesses buying radio equipment and services. It is not directed at children, and we do not knowingly collect personal information from children. IOTEL does not ask for your date of birth. If you believe a child has created an account, please contact us so we can remove it.',
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to confirm the minimum age for accounts (see the Terms of Service).',
        },
      ],
    },
    {
      id: 'breach',
      title: 'Data Breach Notifications',
      blocks: [
        {
          kind: 'p',
          text: "If a personal data breach occurs that is likely to put you at real risk of serious harm, Goldcomm will notify the National Privacy Commission and the affected customers within the period required by the NPC's rules on personal data breach management (currently within 72 hours of becoming aware of it). The notice will describe what happened, what information was involved, what we are doing about it and what you can do to protect yourself.",
        },
        {
          kind: 'confirm',
          text: 'Goldcomm Corporation to confirm that it has a breach response procedure and team in place, as the NPC requires.',
        },
      ],
    },
    {
      id: 'updates',
      title: 'Changes to this Privacy Policy',
      blocks: [
        {
          kind: 'p',
          text: 'We will update this policy when IOTEL or our practices change. The updated version will be published in IOTEL with a new version number and effective date. The version you accepted when you registered is recorded with your account.',
        },
      ],
    },
    {
      id: 'privacy-contact',
      title: 'Contact Information and Data Protection Officer',
      blocks: [
        {
          kind: 'p',
          text: "For questions about this policy or to exercise your privacy rights, contact Goldcomm Corporation's Data Protection Officer. Signed-in customers can also reach us through Messages in IOTEL.",
        },
        {
          kind: 'confirm',
          text: "Goldcomm Corporation to provide its Data Protection Officer's name or title, a dedicated privacy email address, a mailing address and a telephone number, and to confirm its registration with the National Privacy Commission if required.",
        },
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: Readonly<Record<LegalDocumentId, LegalDocument>> = {
  terms: TERMS_OF_SERVICE,
  privacy: PRIVACY_POLICY,
};

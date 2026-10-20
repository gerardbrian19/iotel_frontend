/**
 * An account customers send GCash / bank transfers to: a document of `paymentReceivers`, managed by admins at
 * `/admin/payment-receivers`. Mirrored by `validReceiver` in firestore.rules.
 */
export interface PaymentReceiver {
  id: string;
  type: 'gcash' | 'bank';
  /** What customers see on the option, e.g. "GCash" or "BPI Savings". */
  label: string;
  /** For banks, e.g. "BPI" (`PH_BANKS`); empty for GCash. */
  bankName: string;
  accountName: string;
  /** Mobile number for GCash, account number for a bank. */
  accountNumber: string;
  branch: string;
  /** QR code image in Firebase Storage (`paymentReceivers/{id}/…`); empty when there is none. */
  qrPath: string;
  /** Extra instructions shown to the customer. */
  instructions: string;
  /** Inactive accounts are hidden from customers but kept for history. */
  isActive: boolean;
  /** Lower first. */
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** What admins write. */
export type PaymentReceiverInput = Omit<PaymentReceiver, 'id' | 'createdAt' | 'updatedAt'>;

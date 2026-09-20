import { DocumentData, QueryDocumentSnapshot, Timestamp } from 'firebase/firestore';

/** ISO string of a Firestore `Timestamp`, or `''` when the field is missing. */
export function isoOf(value: unknown): string {
  return value instanceof Timestamp ? value.toDate().toISOString() : '';
}

/**
 * Document data where a pending `serverTimestamp()` write reads as a provisional local time instead of `null`,
 * so a just-sent message or booking sorts and displays correctly before the server confirms it.
 */
export function dataOf(snap: QueryDocumentSnapshot<DocumentData>): DocumentData {
  return snap.data({ serverTimestamps: 'estimate' });
}

export type UserRole = 'customer' | 'admin' | 'staff';

export const USER_ROLES: readonly UserRole[] = ['customer', 'staff', 'admin'];

export type Gender = 'male' | 'female' | 'other' | 'prefer-not-to-say';

/** Mirrored in firestore.rules (`validGender`). */
export const GENDERS: readonly { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer-not-to-say', label: 'Prefer not to say' },
];

/** Mirrored in firestore.rules (`validBio`). */
export const BIO_MAX_LENGTH = 300;

export interface User {
  /** Firebase Auth uid; also the id of the `users/{uid}` Firestore document. */
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** Profile picture as a small JPEG data URL (see `resizeToAvatar`); absent when none was set. */
  photoURL?: string;
  /** Optional, set by the user on their Profile page. */
  gender?: Gender;
  /** `YYYY-MM-DD`; optional, set by the user on their Profile page. */
  dateOfBirth?: string;
  /** `09XXXXXXXXX`; optional, set by the user on their Profile page. */
  phone?: string;
  /** Optional, at most `BIO_MAX_LENGTH` characters, set by the user on their Profile page. */
  bio?: string;
  createdAt?: string;
}

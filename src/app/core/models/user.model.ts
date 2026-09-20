export type UserRole = 'customer' | 'admin' | 'staff';

export const USER_ROLES: readonly UserRole[] = ['customer', 'staff', 'admin'];

export interface User {
  /** Firebase Auth uid; also the id of the `users/{uid}` Firestore document. */
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt?: string;
}

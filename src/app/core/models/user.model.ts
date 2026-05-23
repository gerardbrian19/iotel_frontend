export type UserRole = 'customer' | 'admin' | 'staff';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { inject } from '@angular/core';
import { User, UserRole } from '../models';
import { MOCK_USERS } from '../mocks/mock-data';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);

  readonly currentUser = signal<User | null>(null);
  readonly isLoggedIn = computed(() => this.currentUser() !== null);

  login(email: string, password: string): boolean {
    const user = MOCK_USERS.find(u => u.email === email);
    // Mock: any non-empty password works for demo
    if (user && password.length >= 6) {
      this.currentUser.set(user);
      return true;
    }
    return false;
  }

  logout(): void {
    this.currentUser.set(null);
    this.router.navigate(['/auth/login']);
  }

  hasRole(role: UserRole): boolean {
    return this.currentUser()?.role === role;
  }
}

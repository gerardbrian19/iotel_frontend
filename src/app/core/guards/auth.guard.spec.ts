import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

const mockRouteSnapshot = {} as ActivatedRouteSnapshot;
const mockStateSnapshot = { url: '/customer' } as RouterStateSnapshot;

describe('authGuard', () => {
  let authService: AuthService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate'), createUrlTree: jasmine.createSpy('createUrlTree').and.returnValue({}) } },
      ],
    });
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  it('should allow access when logged in', () => {
    authService.login('customer@demo.com', 'password123');
    const result = TestBed.runInInjectionContext(() => authGuard(mockRouteSnapshot, mockStateSnapshot));
    expect(result).toBe(true);
  });

  it('should block access and redirect when not logged in', () => {
    const result = TestBed.runInInjectionContext(() => authGuard(mockRouteSnapshot, mockStateSnapshot));
    expect(result).not.toBe(true);
  });
});

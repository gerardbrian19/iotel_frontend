import { TestBed } from '@angular/core/testing';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { roleGuard } from './role.guard';
import { AuthService } from '../services/auth.service';

const mockRouteSnapshot = {} as ActivatedRouteSnapshot;
const mockStateSnapshot = { url: '/customer' } as RouterStateSnapshot;

describe('roleGuard', () => {
  let authService: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate'), createUrlTree: jasmine.createSpy('createUrlTree').and.returnValue({}) } },
      ],
    });
    authService = TestBed.inject(AuthService);
  });

  it('should allow access when role matches', () => {
    authService.login('customer@demo.com', 'password123');
    const guard = roleGuard('customer');
    const result = TestBed.runInInjectionContext(() => guard(mockRouteSnapshot, mockStateSnapshot));
    expect(result).toBe(true);
  });

  it('should block access when role does not match', () => {
    authService.login('customer@demo.com', 'password123');
    const guard = roleGuard('admin');
    const result = TestBed.runInInjectionContext(() => guard(mockRouteSnapshot, mockStateSnapshot));
    expect(result).not.toBe(true);
  });

  it('should block access when not logged in', () => {
    const guard = roleGuard('customer');
    const result = TestBed.runInInjectionContext(() => guard(mockRouteSnapshot, mockStateSnapshot));
    expect(result).not.toBe(true);
  });
});

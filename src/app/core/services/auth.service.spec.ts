import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with no user', () => {
    expect(service.currentUser()).toBeNull();
    expect(service.isLoggedIn()).toBe(false);
  });

  it('should login customer with valid credentials', () => {
    const result = service.login('customer@demo.com', 'password123');
    expect(result).toBe(true);
    expect(service.isLoggedIn()).toBe(true);
    expect(service.currentUser()?.role).toBe('customer');
  });

  it('should login admin with valid credentials', () => {
    const result = service.login('admin@demo.com', 'anypass');
    expect(result).toBe(true);
    expect(service.currentUser()?.role).toBe('admin');
  });

  it('should login staff with valid credentials', () => {
    const result = service.login('staff@demo.com', 'anypass');
    expect(result).toBe(true);
    expect(service.currentUser()?.role).toBe('staff');
  });

  it('should reject login with wrong email', () => {
    const result = service.login('wrong@email.com', 'password123');
    expect(result).toBe(false);
    expect(service.isLoggedIn()).toBe(false);
  });

  it('should reject login with short password', () => {
    const result = service.login('customer@demo.com', 'abc');
    expect(result).toBe(false);
    expect(service.isLoggedIn()).toBe(false);
  });

  it('should logout successfully', () => {
    service.login('customer@demo.com', 'password123');
    service.logout();
    expect(service.currentUser()).toBeNull();
    expect(service.isLoggedIn()).toBe(false);
  });

  it('should check role correctly', () => {
    service.login('customer@demo.com', 'password123');
    expect(service.hasRole('customer')).toBe(true);
    expect(service.hasRole('admin')).toBe(false);
  });
});

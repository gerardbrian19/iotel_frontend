import { TestBed } from '@angular/core/testing';
import { CartService } from './cart.service';

describe('CartService', () => {
  let service: CartService;

  const mockItem = { productId: '1', name: 'Test Radio', price: 5000, qty: 1, imageUrl: 'https://placehold.co/100' };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CartService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start empty', () => {
    expect(service.items()).toEqual([]);
    expect(service.count()).toBe(0);
    expect(service.subtotal()).toBe(0);
  });

  it('should add item to cart', (done) => {
    service.addItem(mockItem).subscribe(() => {
      expect(service.items().length).toBe(1);
      expect(service.items()[0].name).toBe('Test Radio');
      done();
    });
  });

  it('should increment qty when adding same item', (done) => {
    service.addItem(mockItem).subscribe(() => {
      service.addItem(mockItem).subscribe(() => {
        expect(service.items().length).toBe(1);
        expect(service.items()[0].qty).toBe(2);
        done();
      });
    });
  });

  it('should calculate subtotal correctly', (done) => {
    service.addItem(mockItem).subscribe(() => {
      expect(service.subtotal()).toBe(5000);
      done();
    });
  });

  it('should apply free shipping at ₱5000+', (done) => {
    service.addItem(mockItem).subscribe(() => {
      expect(service.shippingFee()).toBe(0);
      done();
    });
  });

  it('should charge shipping under ₱5000', (done) => {
    service.addItem({ ...mockItem, price: 1000 }).subscribe(() => {
      expect(service.shippingFee()).toBeGreaterThan(0);
      done();
    });
  });

  it('should update qty', (done) => {
    service.addItem(mockItem).subscribe(() => {
      service.updateQty('1', 3).subscribe(() => {
        expect(service.items()[0].qty).toBe(3);
        done();
      });
    });
  });

  it('should remove item', (done) => {
    service.addItem(mockItem).subscribe(() => {
      service.removeItem('1').subscribe(() => {
        expect(service.items().length).toBe(0);
        done();
      });
    });
  });

  it('should clear cart', (done) => {
    service.addItem(mockItem).subscribe(() => {
      service.clear().subscribe(() => {
        expect(service.items().length).toBe(0);
        done();
      });
    });
  });
});

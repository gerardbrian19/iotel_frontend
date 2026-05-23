import { TestBed } from '@angular/core/testing';
import { ProductService } from './product.service';

describe('ProductService', () => {
  let service: ProductService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ProductService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should load initial mock products', (done) => {
    service.getAll().subscribe(products => {
      expect(products.length).toBeGreaterThan(0);
      done();
    });
  });

  it('should get product by id', (done) => {
    service.getAll().subscribe(products => {
      const id = products[0].id;
      service.getById(id).subscribe(p => {
        expect(p?.id).toBe(id);
        done();
      });
    });
  });

  it('should return undefined for unknown id', (done) => {
    service.getById(99999).subscribe(p => {
      expect(p).toBeUndefined();
      done();
    });
  });

  it('should add a new product', (done) => {
    const before = service.products().length;
    service.add({ name: 'New Radio', category: 'Handheld', price: 3000, stock: 10, inStock: true, imageUrl: '', description: 'Test' }).subscribe(() => {
      expect(service.products().length).toBe(before + 1);
      done();
    });
  });

  it('should update a product', (done) => {
    const p = service.products()[0];
    service.update(p.id, { ...p, name: 'Updated Name' }).subscribe(() => {
      expect(service.products().find(x => x.id === p.id)?.name).toBe('Updated Name');
      done();
    });
  });

  it('should remove a product', (done) => {
    const before = service.products().length;
    const id = service.products()[0].id;
    service.remove(id).subscribe(() => {
      expect(service.products().length).toBe(before - 1);
      done();
    });
  });

  it('should toggle stock', (done) => {
    const p = service.products()[0];
    const was = p.inStock;
    service.toggleStock(p.id).subscribe(() => {
      expect(service.products().find(x => x.id === p.id)?.inStock).toBe(!was);
      done();
    });
  });

  it('should adjust stock quantity', (done) => {
    const p = service.products()[0];
    service.adjustStock(p.id, 99).subscribe(() => {
      expect(service.products().find(x => x.id === p.id)?.stock).toBe(99);
      done();
    });
  });

  it('should filter by category', (done) => {
    service.getByCategory('Handheld').subscribe(list => {
      expect(list.every(p => p.category === 'Handheld')).toBe(true);
      done();
    });
  });
});

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { ProductService } from '../../../core/services/product.service';
import { Product, ProductCategory } from '../../../core/models';

@Component({
  selector: 'app-admin-products',
  standalone: true,
  imports: [
    CurrencyPipe, FormsModule, ReactiveFormsModule,
    NzTableModule, NzTagModule, NzButtonModule, NzInputModule, NzIconModule,
    NzSelectModule, NzModalModule, NzFormModule, NzSwitchModule, NzInputNumberModule,
  ],
  templateUrl: './products.component.html',
  styleUrl: './products.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminProductsComponent {
  private readonly productService = inject(ProductService);
  private readonly modal = inject(NzModalService);
  private readonly msg = inject(NzMessageService);
  private readonly fb = inject(FormBuilder);

  readonly categories: ProductCategory[] = ['Handheld', 'Marine', 'Base Station', 'Accessories'];
  readonly search = signal('');
  readonly categoryFilter = signal<ProductCategory | 'All'>('All');
  readonly modalVisible = signal(false);
  readonly editingId = signal<number | null>(null);

  readonly form = this.fb.group({
    name: ['', Validators.required],
    category: ['Handheld' as ProductCategory, Validators.required],
    price: [0, [Validators.required, Validators.min(1)]],
    stock: [0, Validators.required],
    inStock: [true],
    imageUrl: ['https://placehold.co/300x300/1A1A1A/C9A84C?text=Product'],
    description: ['', Validators.required],
  });

  readonly products = this.productService.products;

  readonly filtered = computed(() => {
    let list = this.products();
    const cat = this.categoryFilter();
    const q = this.search().toLowerCase();
    if (cat !== 'All') list = list.filter(p => p.category === cat);
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q));
    return list;
  });

  openAdd() { this.editingId.set(null); this.form.reset({ inStock: true, imageUrl: 'https://placehold.co/300x300/1A1A1A/C9A84C?text=Product', category: 'Handheld', price: 0, stock: 0 }); this.modalVisible.set(true); }

  openEdit(p: Product) {
    this.editingId.set(p.id);
    this.form.patchValue(p);
    this.modalVisible.set(true);
  }

  save() {
    if (this.form.invalid) return;
    const v = this.form.value as Omit<Product, 'id'>;
    if (this.editingId()) {
      this.productService.update(this.editingId()!, v).subscribe(() => { this.msg.success('Product updated'); this.modalVisible.set(false); });
    } else {
      this.productService.add(v).subscribe(() => { this.msg.success('Product added'); this.modalVisible.set(false); });
    }
  }

  confirmDelete(p: Product) {
    this.modal.confirm({ nzTitle: `Delete "${p.name}"?`, nzContent: 'This action cannot be undone.', nzOkText: 'Delete', nzOkDanger: true, nzOnOk: () => { this.productService.remove(p.id).subscribe(() => this.msg.success('Product deleted')); } });
  }

  toggleStock(p: Product) { this.productService.toggleStock(p.id).subscribe(); }
}

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
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { Observable } from 'rxjs';
import { ProductService } from '../../../core/services/product.service';
import { PRODUCT_CATEGORIES, Product, ProductCategory } from '../../../core/models';
import { PLACEHOLDER_IMAGE, onImageError } from '../../../shared/utils/product-image';
import {
  CategoryFilter, CategoryFilterComponent, filterByCategory,
} from '../../../shared/components/category-filter/category-filter.component';
import { requiredTrimmed } from '../../../shared/utils/validators';

/** A site image (`/images/…`) or a web address. */
const IMAGE_URL_RE = /^(\/\S+|https?:\/\/\S+)$/i;

@Component({
  selector: 'app-admin-products',
  standalone: true,
  imports: [
    CurrencyPipe, FormsModule, ReactiveFormsModule,
    NzTableModule, NzTagModule, NzButtonModule, NzInputModule, NzIconModule,
    NzSelectModule, NzModalModule, NzFormModule, NzSwitchModule, NzInputNumberModule, NzAlertModule,
    CategoryFilterComponent,
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

  readonly categories = PRODUCT_CATEGORIES;
  readonly placeholder = PLACEHOLDER_IMAGE;
  readonly onImageError = onImageError;
  readonly search = signal('');
  readonly categoryFilter = signal<CategoryFilter>('All');
  readonly modalVisible = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', [requiredTrimmed, Validators.maxLength(150)]],
    brand: ['', Validators.maxLength(60)],
    model: ['', Validators.maxLength(100)],
    category: ['Radios' as ProductCategory, Validators.required],
    subcategory: ['', Validators.maxLength(60)],
    price: [null as number | null, Validators.min(0)],
    stock: [0, [Validators.required, Validators.min(0)]],
    isActive: [true],
    imageUrl: ['', Validators.pattern(IMAGE_URL_RE)],
    description: ['', [requiredTrimmed, Validators.maxLength(2000)]],
  });

  readonly products = this.productService.products;
  readonly loading = this.productService.loading;
  readonly error = this.productService.error;

  /** Products matching the search; the category tabs count these. */
  readonly searched = computed(() => {
    const q = this.search().toLowerCase();
    const list = this.products();
    return q ? list.filter(p => `${p.name} ${p.brand} ${p.model}`.toLowerCase().includes(q)) : list;
  });

  readonly filtered = computed(() => filterByCategory(this.searched(), this.categoryFilter()));

  openAdd() {
    this.editingId.set(null);
    this.form.reset({ category: 'Radios', price: null, stock: 0, isActive: true });
    this.modalVisible.set(true);
  }

  openEdit(p: Product) {
    this.editingId.set(p.id);
    this.form.reset({
      name: p.name, brand: p.brand, model: p.model, category: p.category, subcategory: p.subcategory,
      price: p.price, stock: p.stock, isActive: p.isActive, imageUrl: p.imageUrl, description: p.description,
    });
    this.modalVisible.set(true);
  }

  save() {
    if (this.saving()) return;
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach((c) => {
        c.markAsDirty();
        c.updateValueAndValidity({ onlySelf: true });
      });
      return;
    }
    const v = this.form.getRawValue();
    const id = this.editingId();
    const fields = {
      name: v.name.trim(),
      brand: v.brand.trim(),
      model: v.model.trim(),
      category: v.category,
      subcategory: v.subcategory.trim(),
      description: v.description.trim(),
      imageUrl: v.imageUrl.trim(),
      price: v.price,
      stock: Math.floor(v.stock),
      isActive: v.isActive,
    };
    this.saving.set(true);
    const request: Observable<unknown> = id
      ? this.productService.update(id, fields)
      : this.productService.add({ ...fields, oldPrice: null, searchKeywords: [] });
    request.subscribe({
      next: () => {
        this.msg.success(id ? 'Product updated' : 'Product added');
        this.modalVisible.set(false);
        this.saving.set(false);
      },
      error: () => {
        this.msg.error('Could not save the product. You may not have permission.');
        this.saving.set(false);
      },
    });
  }

  confirmDelete(p: Product) {
    this.modal.confirm({
      nzTitle: `Delete "${p.name}"?`,
      nzContent: 'This action cannot be undone.',
      nzOkText: 'Delete',
      nzOkDanger: true,
      nzOnOk: () => this.productService.remove(p.id).subscribe({
        next: () => this.msg.success('Product deleted'),
        error: () => this.msg.error('Could not delete the product.'),
      }),
    });
  }

  setActive(p: Product, active: boolean) {
    this.productService.setActive(p.id, active).subscribe({
      error: () => this.msg.error('Could not update the product.'),
    });
  }
}

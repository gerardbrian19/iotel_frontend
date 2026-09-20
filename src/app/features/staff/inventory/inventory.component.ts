import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { ProductService } from '../../../core/services/product.service';
import { PLACEHOLDER_IMAGE, onImageError } from '../../../shared/utils/product-image';

@Component({
  selector: 'app-staff-inventory',
  standalone: true,
  imports: [FormsModule, NzTableModule, NzTagModule, NzInputModule, NzIconModule, NzSelectModule],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffInventoryComponent {
  private readonly productService = inject(ProductService);

  readonly placeholder = PLACEHOLDER_IMAGE;
  readonly onImageError = onImageError;
  readonly search = signal('');
  readonly products = this.productService.products;

  readonly filtered = computed(() => {
    const q = this.search().toLowerCase();
    return q ? this.products().filter(p => `${p.name} ${p.brand} ${p.model}`.toLowerCase().includes(q)) : this.products();
  });

  stockLevel(stock: number): { label: string; color: string } {
    if (stock === 0) return { label: 'Out of Stock', color: 'error' };
    if (stock <= 5) return { label: 'Low Stock', color: 'warning' };
    return { label: 'In Stock', color: 'success' };
  }
}

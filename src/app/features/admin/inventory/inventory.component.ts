import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzStatisticModule } from 'ng-zorro-antd/statistic';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ProductService } from '../../../core/services/product.service';

type StockFilter = 'All' | 'Low Stock' | 'Out of Stock';

@Component({
  selector: 'app-admin-inventory',
  standalone: true,
  imports: [CurrencyPipe, FormsModule, NzTableModule, NzTagModule, NzButtonModule, NzInputModule, NzIconModule, NzSelectModule, NzInputNumberModule, NzStatisticModule, NzCardModule],
  templateUrl: './inventory.component.html',
  styleUrl: './inventory.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminInventoryComponent {
  private readonly productService = inject(ProductService);
  private readonly msg = inject(NzMessageService);

  readonly search = signal('');
  readonly stockFilter = signal<StockFilter>('All');
  readonly editingStock = signal<Record<number, number>>({});

  readonly products = this.productService.products;

  readonly filtered = computed(() => {
    let list = this.products();
    const sf = this.stockFilter();
    const q = this.search().toLowerCase();
    if (sf === 'Low Stock') list = list.filter(p => p.stock > 0 && p.stock <= 5);
    else if (sf === 'Out of Stock') list = list.filter(p => p.stock === 0);
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q));
    return list;
  });

  readonly totalSKUs = computed(() => this.products().length);
  readonly lowStockCount = computed(() => this.products().filter(p => p.stock > 0 && p.stock <= 5).length);
  readonly outOfStockCount = computed(() => this.products().filter(p => p.stock === 0).length);
  readonly totalUnits = computed(() => this.products().reduce((s, p) => s + p.stock, 0));

  stockLevel(stock: number): { label: string; color: string } {
    if (stock === 0) return { label: 'Out of Stock', color: 'error' };
    if (stock <= 5) return { label: 'Low Stock', color: 'warning' };
    return { label: 'In Stock', color: 'success' };
  }

  setEditStock(id: number, val: number) {
    this.editingStock.update(m => ({ ...m, [id]: val }));
  }

  saveStock(id: number) {
    const qty = this.editingStock()[id];
    if (qty === undefined) return;
    this.productService.adjustStock(id, qty).subscribe(() => {
      this.msg.success('Stock updated');
      this.editingStock.update(m => { const n = { ...m }; delete n[id]; return n; });
    });
  }
}

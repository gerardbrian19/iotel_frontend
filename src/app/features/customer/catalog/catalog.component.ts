import {
  ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { PRODUCT_CATEGORIES, Product, ProductCategory } from '../../../core/models';
import { ProductService } from '../../../core/services/product.service';
import { ProductCardComponent } from '../../../shared/components/product-card/product-card.component';
import { ProductDetailComponent } from '../../../shared/components/product-detail/product-detail.component';

type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'name-asc';
type CategoryFilter = ProductCategory | 'All';

const PAGE_SIZE = 24;

/** Products without a price sort after priced ones in both price directions. */
function comparePrice(a: Product, b: Product, direction: 1 | -1): number {
  if (a.price === null || b.price === null) return (a.price === null ? 1 : 0) - (b.price === null ? 1 : 0);
  return (a.price - b.price) * direction;
}

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzEmptyModule,
    NzIconModule,
    NzInputModule,
    NzInputNumberModule,
    NzPaginationModule,
    NzSelectModule,
    NzSpinModule,
    NzSwitchModule,
    ProductCardComponent,
    ProductDetailComponent,
  ],
  templateUrl: './catalog.component.html',
  styleUrl: './catalog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogComponent {
  private readonly productService = inject(ProductService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly pageSize = PAGE_SIZE;
  readonly loading = this.productService.loading;
  readonly error = this.productService.error;
  readonly catalogSize = computed(() => this.productService.activeProducts().length);

  readonly selectedCategory = signal<CategoryFilter>('All');
  readonly searchQuery = signal('');
  readonly minPrice = signal<number | null>(null);
  readonly maxPrice = signal<number | null>(null);
  readonly inStockOnly = signal(false);
  readonly sortBy = signal<SortOption>('featured');
  readonly page = signal(1);
  private readonly selectedId = signal<string | null>(null);

  private readonly grid = viewChild<ElementRef<HTMLElement>>('grid');

  constructor() {
    // Deep links (from the IOTEL Assistant): ?q=, ?category=, ?min=, ?max=, ?stock=1 and ?product=<id>.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => this.applyQueryParams(params));
  }

  readonly selectedProduct = computed(() => {
    const id = this.selectedId();
    return id ? (this.productService.byId().get(id) ?? null) : null;
  });

  readonly hasActiveFilters = computed(
    () =>
      this.selectedCategory() !== 'All' ||
      this.searchQuery().trim() !== '' ||
      this.minPrice() !== null ||
      this.maxPrice() !== null ||
      this.inStockOnly(),
  );

  /** Everything except the category, so the category tabs can show how many results each would give. */
  private readonly matching = computed(() => {
    const tokens = this.searchQuery().toLowerCase().split(/\s+/).filter(Boolean);
    let min = this.minPrice();
    let max = this.maxPrice();
    if (min !== null && max !== null && min > max) [min, max] = [max, min];
    const inStockOnly = this.inStockOnly();

    return this.productService.activeProducts().filter(p => {
      if (inStockOnly && !p.inStock) return false;
      if (min !== null || max !== null) {
        if (p.price === null) return false;
        if (min !== null && p.price < min) return false;
        if (max !== null && p.price > max) return false;
      }
      if (tokens.length) {
        const haystack = [p.name, p.brand, p.model, ...p.searchKeywords].join(' ').toLowerCase();
        if (!tokens.every(t => haystack.includes(t))) return false;
      }
      return true;
    });
  });

  readonly categoryTabs = computed(() => {
    const counts = new Map<string, number>();
    for (const p of this.matching()) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    const present = new Set(this.productService.activeProducts().map(p => p.category));
    return [
      { name: 'All' as CategoryFilter, count: this.matching().length },
      ...PRODUCT_CATEGORIES.filter(c => present.has(c)).map(c => ({
        name: c as CategoryFilter,
        count: counts.get(c) ?? 0,
      })),
    ];
  });

  readonly filteredProducts = computed(() => {
    const cat = this.selectedCategory();
    const list = cat === 'All' ? [...this.matching()] : this.matching().filter(p => p.category === cat);
    switch (this.sortBy()) {
      case 'price-asc': return list.sort((a, b) => comparePrice(a, b, 1));
      case 'price-desc': return list.sort((a, b) => comparePrice(a, b, -1));
      case 'name-asc': return list.sort((a, b) => a.name.localeCompare(b.name));
      // Featured: what can be bought first, then A → Z.
      default: return list.sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.name.localeCompare(b.name));
    }
  });

  readonly pageProducts = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.filteredProducts().slice(start, start + PAGE_SIZE);
  });

  setCategory(category: CategoryFilter): void {
    this.selectedCategory.set(category);
    this.page.set(1);
  }

  setSearch(value: string): void {
    this.searchQuery.set(value);
    this.page.set(1);
  }

  setMinPrice(value: number | null): void {
    this.minPrice.set(value);
    this.page.set(1);
  }

  setMaxPrice(value: number | null): void {
    this.maxPrice.set(value);
    this.page.set(1);
  }

  setInStockOnly(value: boolean): void {
    this.inStockOnly.set(value);
    this.page.set(1);
  }

  setSort(value: SortOption): void {
    this.sortBy.set(value);
    this.page.set(1);
  }

  clearFilters(): void {
    this.selectedCategory.set('All');
    this.searchQuery.set('');
    this.minPrice.set(null);
    this.maxPrice.set(null);
    this.inStockOnly.set(false);
    this.page.set(1);
  }

  goToPage(page: number): void {
    this.page.set(page);
    this.grid()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  openDetails(product: Product): void {
    this.selectedId.set(product.id);
  }

  closeDetails(): void {
    this.selectedId.set(null);
    // Drop the deep-link param so opening the same product again from a link is a real navigation.
    if (this.route.snapshot.queryParamMap.has('product')) {
      this.router.navigate([], {
        queryParams: { product: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  private applyQueryParams(params: ParamMap): void {
    const product = params.get('product');
    if (product) this.selectedId.set(product);

    const hasFilters = ['q', 'category', 'min', 'max', 'stock'].some(key => params.has(key));
    if (!hasFilters) return;

    const category = params.get('category');
    this.selectedCategory.set(
      (PRODUCT_CATEGORIES as readonly string[]).includes(category ?? '')
        ? (category as ProductCategory)
        : 'All',
    );
    this.searchQuery.set(params.get('q') ?? '');
    this.minPrice.set(this.numberParam(params.get('min')));
    this.maxPrice.set(this.numberParam(params.get('max')));
    this.inStockOnly.set(params.get('stock') === '1');
    this.page.set(1);
  }

  private numberParam(value: string | null): number | null {
    const n = value === null || value === '' ? NaN : Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
}

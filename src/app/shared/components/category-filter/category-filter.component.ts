import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { PRODUCT_CATEGORIES, Product, ProductCategory } from '../../../core/models';

export type CategoryFilter = ProductCategory | 'All';

/**
 * Pill-shaped category tabs for the admin/staff product tables (styled after the customer catalog's tabs).
 * `products` is the list after every other filter (search, stock level), so each count says how many rows
 * picking that category would show. "All" counts every product given, including any with an unknown category.
 */
@Component({
  selector: 'app-category-filter',
  standalone: true,
  templateUrl: './category-filter.component.html',
  styleUrl: './category-filter.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryFilterComponent {
  readonly products = input.required<readonly Product[]>();
  readonly selected = model<CategoryFilter>('All');

  protected readonly tabs = computed(() => {
    const counts = new Map<string, number>();
    for (const p of this.products()) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return [
      { name: 'All' as CategoryFilter, count: this.products().length },
      ...PRODUCT_CATEGORIES.map(c => ({ name: c as CategoryFilter, count: counts.get(c) ?? 0 })),
    ];
  });
}

/** Keeps the products in `category` ("All" keeps every product). */
export function filterByCategory<T extends Product>(list: readonly T[], category: CategoryFilter): readonly T[] {
  return category === 'All' ? list : list.filter(p => p.category === category);
}

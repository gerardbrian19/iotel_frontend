import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { MonthlySales, salesAxis } from '../../../../core/orders/sales-view';

const COMPACT = new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 });

@Component({
  selector: 'app-sales-chart',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './sales-chart.component.html',
  styleUrl: './sales-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesChartComponent {
  readonly data = input.required<readonly MonthlySales[]>();

  /** Index of the column under the pointer or focus. */
  readonly active = signal<number | null>(null);

  readonly axis = computed(() => salesAxis(Math.max(0, ...this.data().map((m) => m.total))));

  readonly yTicks = computed(() => {
    const { top, ticks } = this.axis();
    return ticks.map((value) => ({ value, pct: (value / top) * 100 }));
  });

  readonly columns = computed(() => {
    const { top } = this.axis();
    return this.data().map((month) => ({
      ...month,
      pct: (month.total / top) * 100,
      description: `${month.title}: ${month.total.toLocaleString('en-PH')} pesos, ${month.orders} orders`,
    }));
  });

  readonly isEmpty = computed(() => this.data().every((m) => m.total === 0));

  /** The one bar that gets a value label: the best month. */
  readonly peakIndex = computed(() => {
    const totals = this.data().map((m) => m.total);
    const peak = Math.max(0, ...totals);
    return peak > 0 ? totals.indexOf(peak) : -1;
  });

  readonly tooltip = computed(() => {
    const index = this.active();
    const column = index === null ? undefined : this.columns()[index];
    if (!column || index === null) return null;
    const count = this.columns().length;
    return {
      ...column,
      left: ((index + 0.5) / count) * 100,
      // Keep the tooltip inside the card at both ends.
      align: index < 2 ? 'start' : index >= count - 2 ? 'end' : 'center',
    };
  });

  readonly compact = (value: number) => (value === 0 ? '₱0' : `₱${COMPACT.format(value)}`);
}

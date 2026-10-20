import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { SalesBucket, salesAxis } from '../../../../core/orders/sales-view';

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
  readonly data = input.required<readonly SalesBucket[]>();
  /** Accessible name of the plot, e.g. "Sales per day". */
  readonly label = input('Sales');

  /** Index of the column under the pointer or focus. */
  readonly active = signal<number | null>(null);

  readonly axis = computed(() => salesAxis(Math.max(0, ...this.data().map((m) => m.total))));

  readonly yTicks = computed(() => {
    const { top, ticks } = this.axis();
    return ticks.map((value) => ({ value, pct: (value / top) * 100 }));
  });

  readonly columns = computed(() => {
    const { top } = this.axis();
    return this.data().map((bucket) => ({
      ...bucket,
      pct: (bucket.total / top) * 100,
      description: `${bucket.title}: ${bucket.total.toLocaleString('en-PH')} pesos, ${bucket.orders} orders`,
    }));
  });

  readonly isEmpty = computed(() => this.data().every((m) => m.total === 0));

  /** The one bar that gets a value label: the best day, week or month. */
  readonly peakIndex = computed(() => {
    const totals = this.data().map((m) => m.total);
    const peak = Math.max(0, ...totals);
    return peak > 0 ? totals.indexOf(peak) : -1;
  });

  readonly tooltip = computed(() => {
    const index = this.active();
    const column = index === null ? undefined : this.columns()[index];
    if (!column || index === null) return null;
    const left = ((index + 0.5) / this.columns().length) * 100;
    return {
      ...column,
      left,
      // Keep the tooltip inside the card at both ends.
      align: left < 20 ? 'start' : left > 80 ? 'end' : 'center',
    };
  });

  readonly compact = (value: number) => (value === 0 ? '₱0' : `₱${COMPACT.format(value)}`);
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { NzIconModule } from 'ng-zorro-antd/icon';

/** Read-only stars for a rating (fractions fill part of a star), with the number and review count beside them. */
@Component({
  selector: 'app-star-rating',
  standalone: true,
  imports: [DecimalPipe, NzIconModule],
  template: `
    <span class="stars" [style.font-size.px]="size()" [attr.aria-label]="label()" role="img">
      @for (fill of fills(); track $index) {
        <span class="star">
          <span nz-icon nzType="star" nzTheme="fill" class="star-empty"></span>
          <span class="star-fill" [style.width.%]="fill"
            ><span nz-icon nzType="star" nzTheme="fill"></span
          ></span>
        </span>
      }
    </span>
    @if (showValue()) {
      <span class="value">{{ value() | number: '1.1-1' }}</span>
    }
    @if (count() !== null) {
      <span class="count">({{ count() }})</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      line-height: 1;
    }
    .stars {
      display: inline-flex;
      gap: 1px;
    }
    .star {
      position: relative;
      display: inline-block;
    }
    .star-empty {
      color: #e0e0e0;
    }
    .star-fill {
      position: absolute;
      inset: 0 auto 0 0;
      overflow: hidden;
      color: #c9a84c;
      white-space: nowrap;
    }
    .value {
      font-size: 13px;
      font-weight: 600;
      color: #1a1a1a;
    }
    .count {
      font-size: 12px;
      color: #8c8c8c;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StarRatingComponent {
  /** 0–5; fractions are allowed. */
  readonly value = input.required<number>();
  /** Number of reviews, shown in brackets; null hides it. */
  readonly count = input<number | null>(null);
  readonly showValue = input(false);
  readonly size = input(14);

  readonly fills = computed(() =>
    [0, 1, 2, 3, 4].map((i) => Math.round(Math.min(1, Math.max(0, this.value() - i)) * 100)),
  );
  readonly label = computed(() => `${this.value().toFixed(1)} out of 5 stars`);
}

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { BookingSummary } from '../../../../core/booking/booking-summary';
import { formatSlot } from '../../../../core/booking/schedule';

/** Dashboard card: service bookings by status, today's and upcoming ones, and booking revenue. */
@Component({
  selector: 'app-bookings-summary',
  standalone: true,
  imports: [CurrencyPipe, NzTagModule],
  templateUrl: './bookings-summary.component.html',
  styleUrl: './bookings-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingsSummaryComponent {
  readonly summary = input.required<BookingSummary>();

  readonly slot = formatSlot;
}

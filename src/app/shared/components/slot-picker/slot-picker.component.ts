import { ChangeDetectionStrategy, Component, computed, effect, inject, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import {
  BOOKING_HORIZON_DAYS,
  BOOKING_SLOTS,
  firstBookableDate,
  formatTime,
  fromDateKey,
  isFullyBooked,
  isOpenDate,
  slotId,
  toDateKey,
} from '../../../core/booking/schedule';
import { BookingService } from '../../../core/services/booking.service';

/**
 * Picks a booking date and time from what is actually free: days that are closed, outside the booking window or
 * fully booked can't be chosen, and slots already taken on the chosen day are greyed out. Availability is live, so a
 * slot someone else books while this is open drops out of the selection.
 */
@Component({
  selector: 'app-slot-picker',
  standalone: true,
  imports: [FormsModule, NzDatePickerModule],
  templateUrl: './slot-picker.component.html',
  styleUrl: './slot-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlotPickerComponent {
  private readonly bookings = inject(BookingService);

  /** Chosen day as `YYYY-MM-DD`. */
  readonly date = model<string | null>(null);
  /** Chosen slot start as `HH:mm`. */
  readonly time = model<string | null>(null);

  readonly pickerValue = computed(() => {
    const date = this.date();
    return date ? fromDateKey(date) : null;
  });
  readonly defaultPickerValue = firstBookableDate();
  readonly horizonDays = BOOKING_HORIZON_DAYS;

  readonly slots = computed(() => {
    const date = this.date();
    const taken = this.bookings.takenSlots();
    return date
      ? BOOKING_SLOTS.map((time) => ({
          time,
          label: formatTime(time),
          taken: taken.has(slotId(date, time)),
        }))
      : [];
  });

  /** Re-evaluated whenever the calendar renders, so it reads the latest availability each time it opens. */
  readonly disabledDate = (day: Date): boolean =>
    !isOpenDate(day) || isFullyBooked(toDateKey(day), this.bookings.takenSlots());

  constructor() {
    effect(() => {
      const time = this.time();
      if (time && this.slots().some((s) => s.time === time && s.taken)) this.time.set(null);
    });
  }

  onDateChange(day: Date | null): void {
    this.date.set(day ? toDateKey(day) : null);
    this.time.set(null);
  }
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { Booking } from '../../../core/models';
import { BookingService, needsStaffAction } from '../../../core/services/booking.service';
import { BookingPanelComponent } from '../booking-panel/booking-panel.component';

interface Group {
  key: string;
  title: string;
  empty: string;
  bookings: Booking[];
}

const bySlot = (a: Booking, b: Booking) =>
  (a.preferredDate + a.preferredTime).localeCompare(b.preferredDate + b.preferredTime);

/** Every service booking for staff and admins, grouped by what needs doing next. */
@Component({
  selector: 'app-bookings-board',
  standalone: true,
  imports: [NzAlertModule, NzEmptyModule, NzSpinModule, NzTabsModule, BookingPanelComponent],
  templateUrl: './bookings-board.component.html',
  styleUrl: './bookings-board.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingsBoardComponent {
  private readonly bookingService = inject(BookingService);

  readonly loading = this.bookingService.loading;
  readonly loadFailed = this.bookingService.error;

  readonly groups = computed<Group[]>(() => {
    const all = this.bookingService.bookings();
    const needsAction = all.filter(needsStaffAction);
    const awaitingPayment = all.filter((b) => b.status === 'Confirmed' && !b.payment);
    const scheduled = all.filter((b) => b.status === 'Paid');
    const history = all.filter((b) => b.status === 'Completed' || b.status === 'Cancelled');
    return [
      {
        key: 'action',
        title: 'Needs action',
        empty: 'Nothing waiting on you. New requests and payments to verify show up here.',
        bookings: needsAction.sort(bySlot),
      },
      {
        key: 'payment',
        title: 'Awaiting payment',
        empty: 'No confirmed bookings are waiting for payment.',
        bookings: awaitingPayment.sort(bySlot),
      },
      {
        key: 'scheduled',
        title: 'Paid & scheduled',
        empty: 'No paid bookings to carry out.',
        bookings: scheduled.sort(bySlot),
      },
      {
        key: 'history',
        title: 'History',
        empty: 'No completed or cancelled bookings yet.',
        bookings: history,
      },
    ];
  });
}

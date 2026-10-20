import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { PaymentSummary } from '../../../../core/payments/payment-summary';

/** Dashboard card: money collected, waiting, refunded, and by payment method (orders and bookings). */
@Component({
  selector: 'app-payments-summary',
  standalone: true,
  imports: [CurrencyPipe, NzAlertModule],
  templateUrl: './payments-summary.component.html',
  styleUrl: './payments-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentsSummaryComponent {
  readonly summary = input.required<PaymentSummary>();
}

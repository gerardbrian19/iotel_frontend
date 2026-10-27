import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { PaymentSummary } from '../../../../core/payments/payment-summary';

/**
 * Dashboard card: money collected, waiting, refunded, transfers to check, revenue per channel (GCash, bank transfer),
 * and by way of paying and payment method (orders and bookings).
 */
@Component({
  selector: 'app-payments-summary',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, RouterLink, NzAlertModule],
  templateUrl: './payments-summary.component.html',
  styleUrl: './payments-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentsSummaryComponent {
  readonly summary = input.required<PaymentSummary>();
}

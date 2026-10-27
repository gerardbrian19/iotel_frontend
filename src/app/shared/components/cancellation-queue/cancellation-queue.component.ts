import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { Order } from '../../../core/models';
import { ORDER_STATUS_COLORS } from '../../../core/orders/order-view';
import {
  PAYMENT_PROVIDER_LABELS,
  paymentMethodLabel,
} from '../../../core/payments/payment-methods';
import { AuthService } from '../../../core/services/auth.service';
import { OrderService } from '../../../core/services/order.service';
import { OrderActionsComponent } from '../order-actions/order-actions.component';

/** How many decided requests the History tab shows. */
const HISTORY_SIZE = 30;

/**
 * Staff and admins: paid orders customers asked to cancel. Each card shows the order, the payment and the customer's reason,
 * with Approve & refund (the `refundPayment` function, which also cancels and restocks) or Reject (with a reason the
 * customer sees). Lives at `/staff/cancellations` and `/admin/cancellations`.
 */
@Component({
  selector: 'app-cancellation-queue',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    NzButtonModule,
    NzCardModule,
    NzEmptyModule,
    NzTagModule,
    OrderActionsComponent,
  ],
  template: `
    <div class="cq">
      <h1 class="cq-title">Cancellation requests</h1>
      <p class="cq-intro">
        Customers who already paid ask here to cancel their order. Approving refunds the full amount
        and cancels the order (a processing order's items go back into stock). PayMongo can't refund
        QR Ph payments, so for those and for bank / GCash transfers, send the money to the account
        the customer gave first, then enter that transfer's reference (and a screenshot if you have
        one). Rejecting keeps the order going and shows the customer your reason.
      </p>

      <div class="cq-tabs">
        <button class="cq-tab" [class.active]="tab() === 'open'" (click)="tab.set('open')">
          Waiting <span class="cq-count">{{ open().length }}</span>
        </button>
        <button class="cq-tab" [class.active]="tab() === 'history'" (click)="tab.set('history')">
          History <span class="cq-count">{{ history().length }}</span>
        </button>
      </div>

      @for (order of shown(); track order.id) {
        <nz-card class="cq-card" [nzTitle]="title" [nzExtra]="extra">
          <ng-template #title>
            <span class="cq-code">{{ order.code }}</span> · {{ order.customerName }}
            <nz-tag [nzColor]="statusColors[order.status]" class="cq-status">{{
              order.status
            }}</nz-tag>
          </ng-template>
          <ng-template #extra>
            <a nz-button nzType="link" nzSize="small" [routerLink]="ordersLink()">Orders</a>
          </ng-template>

          <div class="cq-facts">
            <div>
              <span class="cq-label">Paid</span>
              <strong class="cq-amount">{{
                order.payment.amount | currency: 'PHP' : 'symbol-narrow' : '1.0-2'
              }}</strong>
            </div>
            <div>
              <span class="cq-label">Payment</span>
              <span>{{ paymentLabel(order) }}</span>
            </div>
            <div>
              <span class="cq-label">Items</span>
              <span>{{ itemsLabel(order) }}</span>
            </div>
            <div>
              <span class="cq-label">Ordered</span>
              <span>{{ order.createdAt | date: 'MMM d, y' }}</span>
            </div>
          </div>

          <app-order-actions [order]="order" />
        </nz-card>
      } @empty {
        <nz-empty
          [nzNotFoundContent]="
            tab() === 'open'
              ? 'No cancellation requests waiting. New ones appear here as soon as customers send them.'
              : 'No cancellation requests decided yet.'
          "
        />
      }
    </div>
  `,
  styles: `
    .cq {
      max-width: 900px;
      margin: 0 auto;
      padding: 24px 16px;
    }
    .cq-title {
      margin: 0 0 4px;
      font-size: 24px;
      font-weight: 800;
      color: #1a1a1a;
    }
    .cq-intro {
      margin: 0 0 16px;
      font-size: 13px;
      color: #595959;
    }
    .cq-tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    .cq-tab {
      padding: 6px 16px;
      border: 1px solid #e0e0e0;
      border-radius: 999px;
      background: #ffffff;
      color: #1a1a1a;
      font-weight: 500;
      cursor: pointer;
      &.active {
        background: #cc2020;
        border-color: #cc2020;
        color: #ffffff;
        .cq-count {
          background: rgba(255, 255, 255, 0.25);
          color: #ffffff;
        }
      }
    }
    .cq-count {
      margin-left: 4px;
      padding: 0 8px;
      border-radius: 999px;
      background: #f0f0f0;
      font-size: 12px;
    }
    .cq-card {
      margin-bottom: 16px;
      border-radius: 12px;
    }
    .cq-code {
      font-weight: 700;
    }
    .cq-status {
      margin-left: 8px;
    }
    .cq-facts {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 4px;
      font-size: 13px;
      div {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      @media (max-width: 640px) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    .cq-label {
      font-size: 12px;
      color: #8c8c8c;
    }
    .cq-amount {
      font-size: 16px;
      color: #cc2020;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CancellationQueueComponent {
  private readonly orders = inject(OrderService);
  private readonly auth = inject(AuthService);

  readonly statusColors = ORDER_STATUS_COLORS;
  readonly tab = signal<'open' | 'history'>('open');
  readonly open = this.orders.openCancelRequests;
  /** Approved or rejected requests, latest decision first. */
  readonly history = computed(() =>
    this.orders
      .orders()
      .filter((o) => o.cancelRequest && o.cancelRequest.status !== 'pending')
      .sort((a, b) =>
        (b.cancelRequest!.reviewedAt ?? '').localeCompare(a.cancelRequest!.reviewedAt ?? ''),
      )
      .slice(0, HISTORY_SIZE),
  );
  readonly shown = computed(() => (this.tab() === 'open' ? this.open() : this.history()));
  readonly ordersLink = computed(() => `/${this.auth.currentUser()?.role ?? 'admin'}/orders`);

  paymentLabel(order: Order): string {
    const method = paymentMethodLabel(order.payment.method);
    const way = PAYMENT_PROVIDER_LABELS[order.payment.provider];
    return method ? `${method} · ${way}` : way;
  }

  itemsLabel(order: Order): string {
    const count = order.items.reduce((sum, item) => sum + item.qty, 0);
    const first = order.items[0]?.name ?? '';
    return order.items.length > 1
      ? `${first} +${order.items.length - 1} more`
      : `${count} × ${first}`;
  }
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { AuthService } from '../../../core/services/auth.service';
import { ManualPaymentService } from '../../../core/services/manual-payment.service';
import { PaymentProofComponent } from '../payment-proof/payment-proof.component';

/**
 * Staff and admins: every bank / GCash transfer waiting to be checked, oldest first, with Approve and Reject. Lives at
 * `/staff/payments` and `/admin/payments`.
 */
@Component({
  selector: 'app-payment-review-queue',
  standalone: true,
  imports: [
    DatePipe,
    RouterLink,
    NzButtonModule,
    NzCardModule,
    NzEmptyModule,
    NzIconModule,
    NzTagModule,
    PaymentProofComponent,
  ],
  template: `
    <div class="prq">
      <h1 class="prq-title">Payments to verify</h1>
      <p class="prq-intro">
        Bank and GCash transfers customers sent. Open the account in your banking or GCash app, find
        the transfer by its reference number and amount, then approve it, or reject it with a reason
        so the customer can fix it.
      </p>
      @for (item of items(); track item.kind + item.id) {
        <nz-card class="prq-card" [nzTitle]="title" [nzExtra]="extra">
          <ng-template #title>
            <nz-tag [nzColor]="item.kind === 'order' ? 'blue' : 'purple'">{{
              item.kind === 'order' ? 'Order' : 'Booking'
            }}</nz-tag>
            {{ item.label }} · {{ item.customerName }}
          </ng-template>
          <ng-template #extra>
            <span class="prq-when">{{ item.submittedAt | date: 'MMM d, h:mm a' }}</span>
            @if (item.conversationId) {
              <a
                nz-button
                nzType="link"
                nzSize="small"
                [routerLink]="chatLink()"
                [queryParams]="{ conversation: item.conversationId }"
              >
                <span nz-icon nzType="message"></span> Chat
              </a>
            } @else {
              <a nz-button nzType="link" nzSize="small" [routerLink]="ordersLink()">Orders</a>
            }
          </ng-template>
          <app-payment-proof
            [kind]="item.kind"
            [targetId]="item.id"
            [payment]="item.payment"
            [label]="item.label"
          />
        </nz-card>
      } @empty {
        <nz-empty
          nzNotFoundContent="No payments waiting. New transfers appear here as soon as customers send them."
        />
      }
    </div>
  `,
  styles: `
    .prq {
      max-width: 900px;
      margin: 0 auto;
      padding: 24px 16px;
    }
    .prq-title {
      margin: 0 0 4px;
      font-size: 24px;
      font-weight: 800;
      color: #1A1A1A;
    }
    .prq-intro {
      margin: 0 0 20px;
      font-size: 13px;
      color: #595959;
    }
    .prq-card {
      margin-bottom: 16px;
      border-radius: 12px;
    }
    .prq-when {
      font-size: 12px;
      color: #8C8C8C;
      margin-right: 4px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentReviewQueueComponent {
  private readonly manual = inject(ManualPaymentService);
  private readonly auth = inject(AuthService);

  readonly items = this.manual.toVerify;
  private readonly role = computed(() => this.auth.currentUser()?.role ?? 'staff');
  readonly chatLink = computed(() => `/${this.role()}/messages`);
  readonly ordersLink = computed(() => `/${this.role()}/orders`);
}

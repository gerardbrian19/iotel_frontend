import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { NzResultModule } from 'ng-zorro-antd/result';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { OrderService } from '../../../core/services/order.service';
import { Order } from '../../../core/models';

@Component({
  selector: 'app-order-confirmation',
  standalone: true,
  imports: [
    RouterLink,
    CurrencyPipe,
    DatePipe,
    NzResultModule,
    NzCardModule,
    NzButtonModule,
    NzTagModule,
    NzDividerModule,
    NzIconModule,
    NzAlertModule,
    NzSpinModule,
  ],
  templateUrl: './order-confirmation.component.html',
  styleUrl: './order-confirmation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderConfirmationComponent implements OnInit {
  private readonly orderService = inject(OrderService);
  readonly id = input.required<string>();
  readonly order = signal<Order | null>(null);

  ngOnInit(): void {
    this.orderService.getById(this.id()).subscribe(o => {
      this.order.set(o ?? null);
    });
  }
}

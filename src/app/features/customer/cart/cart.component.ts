import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { CartService } from '../../../core/services/cart.service';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [
    RouterLink,
    CurrencyPipe,
    NzTableModule,
    NzButtonModule,
    NzIconModule,
    NzEmptyModule,
    NzAlertModule,
    NzModalModule,
    NzDividerModule,
  ],
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartComponent {
  readonly cart = inject(CartService);
  private readonly modal = inject(NzModalService);

  readonly items = this.cart.items;
  readonly subtotal = computed(() => this.cart.subtotal);
  readonly shippingFee = computed(() => this.cart.shippingFee);
  readonly total = computed(() => this.cart.total);
  readonly freeShippingLeft = computed(() =>
    Math.max(0, this.cart.freeShippingThreshold - this.cart.subtotal)
  );

  confirmClear(): void {
    this.modal.confirm({
      nzTitle: 'Clear Cart',
      nzContent: 'Are you sure you want to remove all items from your cart?',
      nzOkText: 'Clear Cart',
      nzOkDanger: true,
      nzOnOk: () => this.cart.clear(),
    });
  }

  confirmRemove(productId: number): void {
    this.modal.confirm({
      nzTitle: 'Remove item?',
      nzContent: 'Remove this item from your cart?',
      nzOkText: 'Remove',
      nzOkDanger: true,
      nzCancelText: 'Cancel',
      nzOnOk: () => this.cart.removeItem(productId),
    });
  }
}

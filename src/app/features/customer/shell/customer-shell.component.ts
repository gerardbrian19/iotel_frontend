import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { AuthService } from '../../../core/services/auth.service';
import { CartService } from '../../../core/services/cart.service';
import { ChatbotWidgetComponent } from '../../../shared/components/chatbot-widget/chatbot-widget.component';

@Component({
  selector: 'app-customer-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NzLayoutModule,
    NzMenuModule,
    NzIconModule,
    NzBadgeModule,
    NzDropDownModule,
    NzButtonModule,
    NzDrawerModule,
    ChatbotWidgetComponent,
  ],
  templateUrl: './customer-shell.component.html',
  styleUrl: './customer-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerShellComponent {
  private readonly auth = inject(AuthService);
  private readonly cart = inject(CartService);

  readonly user = this.auth.currentUser;
  readonly cartCount = computed(() => this.cart.count);
  readonly drawerVisible = signal(false);

  logout(): void {
    this.auth.logout();
  }

  openDrawer(): void { this.drawerVisible.set(true); }
  closeDrawer(): void { this.drawerVisible.set(false); }
}

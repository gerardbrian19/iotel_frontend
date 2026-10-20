import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NzBadgeModule } from 'ng-zorro-antd/badge';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { AuthService } from '../../../core/services/auth.service';
import { ManualPaymentService } from '../../../core/services/manual-payment.service';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { injectConfirmSignOut } from '../../../shared/utils/confirm-sign-out';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NzBadgeModule, NzLayoutModule, NzMenuModule, NzIconModule, NzButtonModule, NzDrawerModule, NzModalModule],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShellComponent {
  private readonly auth = inject(AuthService);
  private readonly manualPayments = inject(ManualPaymentService);
  readonly user = this.auth.currentUser;
  /** Bank / GCash transfers waiting to be checked, for the Payments menu badge. */
  readonly toVerify = computed(() => this.manualPayments.toVerify().length);
  readonly siderCollapsed = signal(false);
  readonly drawerVisible = signal(false);

  readonly logout = injectConfirmSignOut();
  openDrawer(): void { this.drawerVisible.set(true); }
  closeDrawer(): void { this.drawerVisible.set(false); }
}

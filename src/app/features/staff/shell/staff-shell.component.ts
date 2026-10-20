import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { AuthService } from '../../../core/services/auth.service';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { injectConfirmSignOut } from '../../../shared/utils/confirm-sign-out';

@Component({
  selector: 'app-staff-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, NzLayoutModule, NzMenuModule, NzIconModule, NzButtonModule, NzDrawerModule, NzModalModule],
  templateUrl: './staff-shell.component.html',
  styleUrl: './staff-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffShellComponent {
  private readonly auth = inject(AuthService);
  readonly user = this.auth.currentUser;
  readonly siderCollapsed = signal(false);
  readonly drawerVisible = signal(false);

  readonly logout = injectConfirmSignOut();
  openDrawer(): void { this.drawerVisible.set(true); }
  closeDrawer(): void { this.drawerVisible.set(false); }
}

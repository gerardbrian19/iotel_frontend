import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NzLayoutModule, NzMenuModule, NzIconModule, NzButtonModule, NzDrawerModule],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShellComponent {
  private readonly auth = inject(AuthService);
  readonly user = this.auth.currentUser;
  readonly siderCollapsed = signal(false);
  readonly drawerVisible = signal(false);

  logout(): void { this.auth.logout(); }
  openDrawer(): void { this.drawerVisible.set(true); }
  closeDrawer(): void { this.drawerVisible.set(false); }
}

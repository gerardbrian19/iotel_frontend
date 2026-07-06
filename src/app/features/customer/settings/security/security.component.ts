import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzMessageService } from 'ng-zorro-antd/message';

@Component({
  selector: 'app-settings-security',
  standalone: true,
  imports: [
    FormsModule,
    NzFormModule,
    NzInputModule,
    NzButtonModule,
    NzSwitchModule,
    NzDividerModule,
    NzIconModule,
    NzTagModule,
  ],
  templateUrl: './security.component.html',
  styleUrl: './security.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecurityComponent {
  private readonly message = inject(NzMessageService);

  readonly twoFAEnabled = signal(false);
  readonly changingPassword = signal(false);

  currentPassword = signal('');
  newPassword = signal('');
  confirmPassword = signal('');

  readonly loginSessions = signal([
    { device: 'Chrome on macOS', location: 'Metro Manila, PH', time: 'Just now', current: true },
    { device: 'Safari on iPhone', location: 'Cebu City, PH', time: '2 days ago', current: false },
  ]);

  changePassword(): void {
    if (this.newPassword() !== this.confirmPassword()) {
      this.message.error('Passwords do not match.');
      return;
    }
    this.changingPassword.set(true);
    // TODO: wire up to change password API
    setTimeout(() => {
      this.changingPassword.set(false);
      this.message.success('Password changed successfully.');
      this.currentPassword.set('');
      this.newPassword.set('');
      this.confirmPassword.set('');
    }, 800);
  }

  revokeSession(device: string): void {
    this.loginSessions.update(s => s.filter(sess => sess.device !== device));
    this.message.success('Session revoked.');
  }
}

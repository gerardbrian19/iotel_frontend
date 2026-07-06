import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzUploadModule } from 'ng-zorro-antd/upload';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-settings-profile',
  standalone: true,
  imports: [
    FormsModule,
    NzCardModule,
    NzFormModule,
    NzInputModule,
    NzButtonModule,
    NzIconModule,
    NzUploadModule,
    NzDividerModule,
  ],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent {
  private readonly auth = inject(AuthService);
  private readonly message = inject(NzMessageService);

  readonly user = this.auth.currentUser;
  readonly saving = signal(false);

  name = signal(this.user()?.name ?? '');
  email = signal(this.user()?.email ?? '');
  phone = signal('');
  bio = signal('');

  save(): void {
    this.saving.set(true);
    // TODO: wire up to profile update API
    setTimeout(() => {
      this.saving.set(false);
      this.message.success('Profile updated successfully.');
    }, 800);
  }
}

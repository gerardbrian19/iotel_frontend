import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../../../core/services/auth.service';
import { avatarFileError, resizeToAvatar } from '../../../../shared/utils/avatar-image';

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
    NzAvatarModule,
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
  readonly photoBusy = signal(false);

  name = signal(this.user()?.name ?? '');
  email = signal(this.user()?.email ?? '');
  phone = signal('');
  bio = signal('');

  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // lets the same file be chosen again after a failure
    if (!file) return;
    const problem = avatarFileError(file);
    if (problem) {
      this.message.error(problem);
      return;
    }
    await this.savePhoto(async () => resizeToAvatar(file), 'Profile picture updated.');
  }

  removePhoto(): Promise<void> {
    return this.savePhoto(async () => null, 'Profile picture removed.');
  }

  private async savePhoto(prepare: () => Promise<string | null>, success: string): Promise<void> {
    this.photoBusy.set(true);
    try {
      await this.auth.setPhoto(await prepare());
      this.message.success(success);
    } catch (err) {
      this.message.error(err instanceof Error ? err.message : 'Could not update your profile picture.');
    } finally {
      this.photoBusy.set(false);
    }
  }

  save(): void {
    this.saving.set(true);
    // TODO: wire up to profile update API
    setTimeout(() => {
      this.saving.set(false);
      this.message.success('Profile updated successfully.');
    }, 800);
  }
}

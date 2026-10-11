import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzAvatarModule } from 'ng-zorro-antd/avatar';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { fromDateKey, toDateKey } from '../../../../core/booking/schedule';
import { BIO_MAX_LENGTH, GENDERS, Gender } from '../../../../core/models';
import { authErrorMessage } from '../../../../core/firebase/auth-errors';
import { AuthService } from '../../../../core/services/auth.service';
import { avatarFileError, resizeToAvatar } from '../../../../shared/utils/avatar-image';
import { MobileInputDirective } from '../../../../shared/directives/mobile-input.directive';
import {
  mobileError,
  normalizeMobile,
  personNameError,
} from '../../../../shared/utils/validators';

@Component({
  selector: 'app-settings-profile',
  standalone: true,
  imports: [
    FormsModule,
    MobileInputDirective,
    NzCardModule,
    NzFormModule,
    NzInputModule,
    NzButtonModule,
    NzIconModule,
    NzAvatarModule,
    NzDividerModule,
    NzSelectModule,
    NzDatePickerModule,
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
  /** Shown only: the sign-in email can't be changed here (firestore.rules). */
  readonly email = computed(() => this.user()?.email ?? '');
  gender = signal<Gender | null>(this.user()?.gender ?? null);
  dateOfBirth = signal<Date | null>(this.dob(this.user()?.dateOfBirth));
  phone = signal(normalizeMobile(this.user()?.phone ?? ''));
  bio = signal(this.user()?.bio ?? '');

  /** Errors show once the user has tried to save, or as soon as a field has something in it. */
  readonly submitted = signal(false);
  readonly nameError = computed(() => personNameError(this.name()));
  readonly phoneError = computed(() => mobileError(this.phone()));
  readonly bioError = computed(() =>
    this.bio().trim().length > BIO_MAX_LENGTH
      ? `Bio must be at most ${BIO_MAX_LENGTH} characters.`
      : null,
  );
  readonly bioMaxLength = BIO_MAX_LENGTH;

  readonly genders = GENDERS;
  /** No future dates and nothing before 1900. */
  readonly disabledBirthDate = (day: Date): boolean => day > new Date() || day.getFullYear() < 1900;

  private dob(key: string | undefined): Date | null {
    return key ? fromDateKey(key) : null;
  }

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
      this.message.error(
        err instanceof Error ? err.message : 'Could not update your profile picture.',
      );
    } finally {
      this.photoBusy.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.saving()) return;
    this.submitted.set(true);
    const problem = this.nameError() ?? this.phoneError() ?? this.bioError();
    if (problem) {
      this.message.error(problem);
      return;
    }
    const dob = this.dateOfBirth();
    if (dob && this.disabledBirthDate(dob)) {
      this.message.error('Please choose a valid date of birth.');
      return;
    }
    this.saving.set(true);
    try {
      await this.auth.updateDetails({
        name: this.name(),
        gender: this.gender(),
        dateOfBirth: dob ? toDateKey(dob) : null,
        phone: this.phone() || null,
        bio: this.bio(),
      });
      this.message.success('Profile updated successfully.');
    } catch (err) {
      this.message.error(authErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}

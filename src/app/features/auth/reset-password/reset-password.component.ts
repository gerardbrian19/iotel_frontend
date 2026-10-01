import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { AuthService } from '../../../core/services/auth.service';
import { authErrorMessage } from '../../../core/firebase/auth-errors';
import { matchesControl, strongPassword } from '../../../shared/utils/validators';

/**
 * Where the password-reset email's link lands once the template's action URL points at the app
 * (`/auth/reset-password?mode=resetPassword&oobCode=...`).
 */
@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NzFormModule,
    NzInputModule,
    NzButtonModule,
    NzAlertModule,
    NzIconModule,
  ],
  templateUrl: './reset-password.component.html',
  styleUrl: '../login/login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  private readonly oobCode: string | null;
  /** The account's email once the link checks out; null while checking or if the link is bad. */
  readonly email = signal<string | null>(null);
  readonly checking = signal(true);
  readonly linkError = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly passwordVisible = signal(false);

  readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required, strongPassword]],
    confirmPassword: ['', [Validators.required, matchesControl('password')]],
  });

  constructor() {
    const params = inject(ActivatedRoute).snapshot.queryParamMap;
    this.oobCode = params.get('mode') === 'resetPassword' ? params.get('oobCode') : null;
    this.form.controls.password.valueChanges
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.form.controls.confirmPassword.updateValueAndValidity());
    void this.checkLink();
  }

  private async checkLink(): Promise<void> {
    if (!this.oobCode) {
      this.linkError.set('This link is invalid or incomplete. Please request a new one.');
      this.checking.set(false);
      return;
    }
    try {
      this.email.set(await this.auth.checkResetCode(this.oobCode));
    } catch (err) {
      this.linkError.set(authErrorMessage(err));
    } finally {
      this.checking.set(false);
    }
  }

  async submit(): Promise<void> {
    if (this.saving() || !this.oobCode) return;
    if (this.form.invalid) {
      this.form.markAllAsDirty();
      this.form.updateValueAndValidity();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.auth.confirmReset(this.oobCode, this.form.getRawValue().password);
      await this.router.navigate(['/auth/login']);
    } catch (err) {
      this.error.set(authErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { AuthService, SecondFactorRequiredError } from '../../../core/services/auth.service';
import { authErrorMessage } from '../../../core/firebase/auth-errors';
import { matchesControl, strongPassword } from '../../utils/validators';

/**
 * Change password + how the account's second sign-in step works. Customer Settings → Account Security, and the
 * Account page of the staff and admin portals.
 */
@Component({
  selector: 'app-account-security',
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    NzFormModule,
    NzInputModule,
    NzButtonModule,
    NzDividerModule,
    NzIconModule,
    NzTagModule,
    NzAlertModule,
    NzPopconfirmModule,
  ],
  templateUrl: './account-security.component.html',
  styleUrl: './account-security.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSecurityComponent {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly user = this.auth.currentUser;
  readonly isCustomer = computed(() => this.user()?.role === 'customer');
  readonly authenticator = signal(this.auth.authenticatorInfo());

  readonly changingPassword = signal(false);
  readonly passwordError = signal<string | null>(null);
  /** Shown once re-checking the password asked for the authenticator code. */
  readonly needsTotp = signal(false);
  readonly removing = signal(false);
  readonly removeError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    current: ['', Validators.required],
    next: ['', [Validators.required, strongPassword]],
    confirm: ['', [Validators.required, matchesControl('next')]],
    totp: [''],
  });

  constructor() {
    this.form.controls.next.valueChanges
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.form.controls.confirm.updateValueAndValidity());
  }

  async changePassword(): Promise<void> {
    if (this.changingPassword()) return;
    if (this.form.invalid) {
      this.form.markAllAsDirty();
      this.form.updateValueAndValidity();
      return;
    }
    const { current, next, totp } = this.form.getRawValue();
    if (this.needsTotp() && !/^\d{6}$/.test(totp.trim())) {
      this.passwordError.set('Enter the 6-digit code from your authenticator app.');
      return;
    }
    this.changingPassword.set(true);
    this.passwordError.set(null);
    try {
      // Signs out on success; the login page says the password changed.
      await this.auth.changePassword(current, next, this.needsTotp() ? totp : undefined);
    } catch (err) {
      if (err instanceof SecondFactorRequiredError) this.needsTotp.set(true);
      this.passwordError.set(authErrorMessage(err));
    } finally {
      this.changingPassword.set(false);
    }
  }

  async replaceAuthenticator(): Promise<void> {
    if (this.removing()) return;
    this.removing.set(true);
    this.removeError.set(null);
    try {
      // Signs out; the next sign-in walks through setting up the new app.
      await this.auth.removeAuthenticator();
    } catch (err) {
      this.removeError.set(authErrorMessage(err));
      this.authenticator.set(this.auth.authenticatorInfo());
    } finally {
      this.removing.set(false);
    }
  }
}

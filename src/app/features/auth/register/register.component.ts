import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { AuthService } from '../../../core/services/auth.service';
import { authErrorMessage } from '../../../core/firebase/auth-errors';
import {
  emailFormat,
  matchesControl,
  personName,
  requiredTrimmed,
  strongPassword,
} from '../../../shared/utils/validators';

@Component({
  selector: 'app-register',
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
  templateUrl: './register.component.html',
  styleUrl: '../login/login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly passwordVisible = signal(false);
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', [requiredTrimmed, personName]],
    email: ['', [requiredTrimmed, emailFormat]],
    password: ['', [Validators.required, strongPassword]],
    confirmPassword: ['', [Validators.required, matchesControl('password')]],
  });

  constructor() {
    // The confirm field's validity depends on the password field, so re-check it when the password changes.
    this.form.controls.password.valueChanges
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.form.controls.confirmPassword.updateValueAndValidity());
  }

  async submit(): Promise<void> {
    if (this.loading()) return;
    if (this.form.invalid) {
      this.form.markAllAsDirty();
      this.form.updateValueAndValidity();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const { name, email, password } = this.form.getRawValue();
    try {
      const user = await this.auth.register(name, email, password);
      await this.router.navigate([`/${user.role}`]);
    } catch (err) {
      this.error.set(authErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}

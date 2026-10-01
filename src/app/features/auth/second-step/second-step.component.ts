import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzQRCodeModule } from 'ng-zorro-antd/qr-code';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService, TotpSetup } from '../../../core/services/auth.service';
import { authErrorMessage } from '../../../core/firebase/auth-errors';

/** `j•••@gmail.com` */
function maskEmail(email: string | null): string {
  if (!email) return 'your email';
  const [name, domain] = email.split('@');
  return `${name.slice(0, 1)}•••@${domain ?? ''}`;
}

/**
 * The step after the password on the login page: the emailed code, the authenticator code, or setting up an
 * authenticator app (staff/admins). Which one is shown comes from `AuthService.pendingStep`.
 */
@Component({
  selector: 'app-second-step',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NzFormModule,
    NzInputModule,
    NzButtonModule,
    NzAlertModule,
    NzIconModule,
    NzQRCodeModule,
  ],
  templateUrl: './second-step.component.html',
  styleUrl: './second-step.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecondStepComponent {
  private readonly auth = inject(AuthService);
  private readonly msg = inject(NzMessageService);

  /** Emitted once the user is fully signed in. */
  readonly signedIn = output<void>();

  readonly step = this.auth.pendingStep;
  readonly maskedEmail = computed(() => maskEmail(this.auth.pendingEmail()));
  readonly sendError = this.auth.codeSendError;
  readonly setupAfterCode = this.auth.setupAfterCode;

  readonly code = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^\d{6}$/)],
  });
  /** `[formGroup]` makes Angular handle the submit; a bare <form> would reload the page and lose the sign-in. */
  readonly form = new FormGroup({ code: this.code });
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly resending = signal(false);

  readonly setup = signal<TotpSetup | null>(null);
  readonly setupError = signal<string | null>(null);

  private readonly now = signal(Date.now());
  readonly resendIn = computed(() =>
    Math.max(0, Math.ceil((this.auth.resendAt() - this.now()) / 1000)),
  );

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    // Each step starts with an empty code box; the authenticator setup fetches its secret when it appears.
    effect(() => {
      const step = this.step();
      untracked(() => {
        this.code.reset('');
        this.error.set(null);
        if (step === 'totp-enroll' && !this.setup()) void this.startSetup();
      });
    });
  }

  async startSetup(): Promise<void> {
    this.setupError.set(null);
    try {
      this.setup.set(await this.auth.startTotpEnrollment());
    } catch (err) {
      this.setupError.set(authErrorMessage(err));
    }
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    this.code.setValue(this.code.value.replace(/\s/g, ''));
    if (this.code.invalid) {
      this.code.markAsDirty();
      this.code.updateValueAndValidity();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      switch (this.step()) {
        case 'email-code':
          await this.auth.verifyEmailCode(this.code.value);
          break;
        case 'totp-code':
          await this.auth.verifyTotp(this.code.value);
          break;
        case 'totp-enroll':
          await this.auth.finishTotpEnrollment(this.code.value);
          this.setup.set(null);
          return;
        default:
          return;
      }
      if (this.auth.isLoggedIn()) this.signedIn.emit();
    } catch (err) {
      this.error.set(authErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }

  async resend(): Promise<void> {
    if (this.resending() || this.resendIn() > 0) return;
    this.resending.set(true);
    this.error.set(null);
    await this.auth.sendEmailCode();
    this.resending.set(false);
    if (!this.sendError()) this.msg.success('A new code is on its way.');
  }

  async copyKey(key: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(key);
      this.msg.success('Key copied');
    } catch {
      this.msg.info('Select the key and copy it by hand.');
    }
  }

  async cancel(): Promise<void> {
    this.setup.set(null);
    await this.auth.cancelPendingLogin();
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { AuthService } from '../../../core/services/auth.service';
import { authErrorMessage } from '../../../core/firebase/auth-errors';
import { LEGAL_DOCUMENTS, LegalDocumentId } from '../../../core/legal/legal-documents';
import { LegalDocumentComponent } from '../../../shared/components/legal-document/legal-document.component';
import {
  emailDomainTypo,
  emailFormat,
  matchesControl,
  personName,
  requiredTrimmed,
  strongPassword,
} from '../../../shared/utils/validators';
import { safeReturnUrl } from '../../../shared/utils/return-url';
import { AuthBrandComponent } from '../../../shared/components/auth-brand/auth-brand.component';

/** How long each document must stay open before it can be agreed to. */
const READ_SECONDS = 10;
const LEGAL_DOC_IDS: readonly LegalDocumentId[] = ['terms', 'privacy'];

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    AuthBrandComponent,
    ReactiveFormsModule,
    RouterLink,
    NzFormModule,
    NzInputModule,
    NzButtonModule,
    NzAlertModule,
    NzIconModule,
    NzCheckboxModule,
    NzModalModule,
    LegalDocumentComponent,
  ],
  templateUrl: './register.component.html',
  styleUrls: ['../login/login.component.scss', './register.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly passwordVisible = signal(false);
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', [requiredTrimmed, personName]],
    email: ['', [requiredTrimmed, emailFormat, emailDomainTypo]],
    password: ['', [Validators.required, strongPassword]],
    confirmPassword: ['', [Validators.required, matchesControl('password')]],
    // Never pre-checked, and locked until both documents have been opened and agreed to (see `agree`).
    acceptLegal: [{ value: false, disabled: true }, Validators.requiredTrue],
  });

  /** Create Account stays disabled until the Terms / Privacy checkbox is ticked. */
  readonly acceptedLegal = toSignal(this.form.controls.acceptLegal.valueChanges, {
    initialValue: false,
  });

  /** The legal document open in the modal, if any. */
  readonly openDocId = signal<LegalDocumentId | null>(null);
  readonly openDoc = computed(() => {
    const id = this.openDocId();
    return id ? LEGAL_DOCUMENTS[id] : null;
  });

  /** Documents the user has opened, stayed on for `READ_SECONDS` and agreed to. */
  readonly agreedDocs = signal<ReadonlySet<LegalDocumentId>>(new Set());
  readonly bothAgreed = computed(() => this.agreedDocs().size === LEGAL_DOC_IDS.length);
  /** Seconds left before the open document's agree button unlocks; 0 once it can be pressed. */
  readonly secondsLeft = signal(0);
  readonly openDocAgreed = computed(() => {
    const id = this.openDocId();
    return id !== null && this.agreedDocs().has(id);
  });

  private countdown: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    // The confirm field's validity depends on the password field, so re-check it when the password changes.
    this.form.controls.password.valueChanges
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => this.form.controls.confirmPassword.updateValueAndValidity());
    destroyRef.onDestroy(() => this.stopCountdown());
  }

  /** Opens a document from the link inside the checkbox label without toggling the checkbox. */
  showDoc(id: LegalDocumentId, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.openDocId.set(id);
    // Every opening of a document not agreed to yet starts the full wait again.
    this.stopCountdown();
    if (this.agreedDocs().has(id)) return;
    this.secondsLeft.set(READ_SECONDS);
    this.countdown = setInterval(() => {
      this.secondsLeft.update((s) => Math.max(0, s - 1));
      if (this.secondsLeft() === 0) this.stopCountdown();
    }, 1000);
  }

  /** The open document's agree button: records it and, once both are agreed, unlocks and ticks the checkbox. */
  agree(): void {
    const id = this.openDocId();
    if (!id || this.secondsLeft() > 0) return;
    this.agreedDocs.update((docs) => new Set([...docs, id]));
    this.closeDoc();
    if (this.bothAgreed()) {
      const consent = this.form.controls.acceptLegal;
      consent.enable();
      consent.setValue(true);
    }
  }

  closeDoc(): void {
    this.stopCountdown();
    this.secondsLeft.set(0);
    this.openDocId.set(null);
  }

  private stopCountdown(): void {
    if (this.countdown !== null) clearInterval(this.countdown);
    this.countdown = null;
  }

  async submit(): Promise<void> {
    if (this.loading()) return;
    // The consent control is disabled (so skipped by validation) until both documents are agreed to.
    if (this.form.invalid || !this.bothAgreed() || !this.form.controls.acceptLegal.value) {
      this.form.markAllAsDirty();
      this.form.updateValueAndValidity();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const { name, email, password } = this.form.getRawValue();
    try {
      await this.auth.register(name, email, password);
      // Two-step sign-in off (TWO_STEP_SIGN_IN): the new customer is already signed in.
      const user = this.auth.currentUser();
      if (user) {
        const returnUrl = safeReturnUrl(
          this.route.snapshot.queryParamMap.get('returnUrl'),
          user.role,
        );
        await this.router.navigateByUrl(returnUrl ?? `/${user.role}`);
        return;
      }
      // The login page shows the emailed-code step and then sends the user on to `returnUrl`.
      await this.router.navigate(['/auth/login'], { queryParamsHandling: 'preserve' });
    } catch (err) {
      this.error.set(authErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}

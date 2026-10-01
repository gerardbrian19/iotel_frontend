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
import { Router, RouterLink } from '@angular/router';
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

  readonly passwordVisible = signal(false);
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', [requiredTrimmed, personName]],
    email: ['', [requiredTrimmed, emailFormat, emailDomainTypo]],
    password: ['', [Validators.required, strongPassword]],
    confirmPassword: ['', [Validators.required, matchesControl('password')]],
    // Never pre-checked: the user has to tick it themselves.
    acceptLegal: [false, Validators.requiredTrue],
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

  constructor() {
    // The confirm field's validity depends on the password field, so re-check it when the password changes.
    this.form.controls.password.valueChanges
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.form.controls.confirmPassword.updateValueAndValidity());
  }

  /** Opens a document from the link inside the checkbox label without toggling the checkbox. */
  showDoc(id: LegalDocumentId, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.openDocId.set(id);
  }

  closeDoc(): void {
    this.openDocId.set(null);
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
      await this.auth.register(name, email, password);
      // The login page shows the emailed-code step and then sends the user on to `returnUrl`.
      await this.router.navigate(['/auth/login'], { queryParamsHandling: 'preserve' });
    } catch (err) {
      this.error.set(authErrorMessage(err));
    } finally {
      this.loading.set(false);
    }
  }
}

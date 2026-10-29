import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { finalize } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { Payment, PaymentReceiver } from '../../../core/models';
import {
  REFERENCE_PATTERN,
  TRANSFER_WINDOW_DAYS,
  canSendProof,
  proofUnderReview,
  receiverLabel,
  receiverTitle,
  transferWindow,
} from '../../../core/payments/manual-payments';
import { ManualPaymentService, PaymentKind } from '../../../core/services/manual-payment.service';
import { orderErrorMessage } from '../../../core/services/order.service';
import { PaymentReceiverService } from '../../../core/services/payment-receiver.service';
import { imageFileError } from '../../utils/proof-image';
import { StorageImageComponent } from '../storage-image/storage-image.component';

/** `YYYY-MM-DDTHH:mm` in local time, for a `datetime-local` input. */
function localInputValue(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

/**
 * Customer side of a GCash / bank transfer: the accounts to send the money to (with their QR codes), then the form for
 * the reference number and the screenshot. While staff check it, it shows what was sent; when they reject it, why.
 *
 * Used for orders (from the order's actions) and bookings (from the booking panel).
 */
@Component({
  selector: 'app-manual-payment-panel',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    ReactiveFormsModule,
    NzAlertModule,
    NzButtonModule,
    NzFormModule,
    NzIconModule,
    NzInputModule,
    NzSpinModule,
    StorageImageComponent,
  ],
  templateUrl: './manual-payment-panel.component.html',
  styleUrl: './manual-payment-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManualPaymentPanelComponent {
  private readonly manual = inject(ManualPaymentService);
  private readonly receiverService = inject(PaymentReceiverService);
  private readonly msg = inject(NzMessageService);
  private readonly fb = inject(FormBuilder);

  readonly kind = input.required<PaymentKind>();
  /** The order or booking id. */
  readonly targetId = input.required<string>();
  /** Amount due in PHP. */
  readonly amount = input.required<number>();
  /** When the payment became due (order placed, booking quoted): the transfer window starts here. */
  readonly dueSince = input<string>();
  /** What to write in the transfer's notes, e.g. the order number. */
  readonly reference = input('');
  /** The current payment; missing for a booking that hasn't chosen how to pay yet. */
  readonly payment = input<Payment>();

  readonly receivers = this.receiverService.activeReceivers;
  readonly receiversLoading = this.receiverService.loading;
  readonly selectedId = linkedSignal<PaymentReceiver[], string | null>({
    source: this.receivers,
    computation: (list, previous) =>
      previous && list.some((r) => r.id === previous.value)
        ? previous.value
        : (list[0]?.id ?? null),
  });
  readonly selected = computed(() => this.receivers().find((r) => r.id === this.selectedId()));

  readonly underReview = computed(() => proofUnderReview(this.payment()));
  /** A booking that isn't on a transfer yet can switch to one; an order paid by transfer only while unpaid. */
  readonly canSend = computed(() => {
    const payment = this.payment();
    return !payment || payment.provider !== 'manual'
      ? payment?.status !== 'Paid'
      : canSendProof(payment);
  });
  readonly rejected = computed(() => {
    const manual = this.payment()?.manual;
    return manual?.state === 'rejected' ? manual : null;
  });
  readonly sent = computed(() => (this.underReview() ? this.payment()?.manual : undefined));

  readonly busy = signal(false);
  readonly file = signal<File | null>(null);
  readonly preview = signal<string | null>(null);
  readonly fileError = signal<string | null>(null);
  readonly windowDays = TRANSFER_WINDOW_DAYS;
  /** Re-read on submit, so a page left open doesn't keep an old "latest" time. */
  private readonly now = signal(new Date());
  readonly window = computed(() => transferWindow(this.dueSince(), this.now()));
  readonly minSentAt = computed(() => localInputValue(this.window().from));
  readonly maxSentAt = computed(() => localInputValue(this.window().to));
  /** The window ended before the customer came back to fill this in. */
  readonly windowEnded = computed(() => this.window().to < this.now());

  readonly form = this.fb.nonNullable.group({
    referenceNumber: ['', [Validators.required, Validators.pattern(REFERENCE_PATTERN)]],
    sentAt: ['', [Validators.required, (c: AbstractControl) => this.sentAtInWindow(c)]],
  });

  readonly receiverLabel = receiverLabel;
  readonly receiverTitle = receiverTitle;

  constructor() {
    // Start at the latest allowed time (now, or the end of the window) and re-check when the window moves.
    effect(() => {
      const latest = this.maxSentAt();
      untracked(() => {
        const control = this.form.controls.sentAt;
        if (!control.dirty) control.setValue(latest);
        else control.updateValueAndValidity();
      });
    });
    inject(DestroyRef).onDestroy(() => this.revokePreview());
  }

  copy(value: string, what: string): void {
    navigator.clipboard?.writeText(value).then(
      () => this.msg.success(`${what} copied.`),
      () => this.msg.info(value),
    );
  }

  onFile(event: Event): void {
    const field = event.target as HTMLInputElement;
    const file = field.files?.[0] ?? null;
    field.value = '';
    if (!file) return;
    const problem = imageFileError(file);
    this.fileError.set(problem);
    if (problem) return;
    this.revokePreview();
    this.file.set(file);
    this.preview.set(URL.createObjectURL(file));
  }

  clearFile(): void {
    this.revokePreview();
    this.file.set(null);
  }

  submit(): void {
    this.now.set(new Date());
    const receiver = this.selected();
    const file = this.file();
    if (this.form.invalid || !receiver || !file) {
      this.form.markAllAsTouched();
      Object.values(this.form.controls).forEach((c) => c.markAsDirty());
      this.form.updateValueAndValidity();
      if (!file) this.fileError.set('Attach a screenshot of the transfer.');
      return;
    }
    const { referenceNumber, sentAt } = this.form.getRawValue();
    this.busy.set(true);
    this.manual
      .submit({
        kind: this.kind(),
        id: this.targetId(),
        receiverId: receiver.id,
        referenceNumber,
        // Always the amount due: customers can't change it.
        amountSent: this.amount(),
        sentAt: new Date(sentAt).toISOString(),
        screenshot: file,
      })
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => {
          this.msg.success('Thank you! We will check your payment shortly.');
          this.clearFile();
          this.form.reset({ referenceNumber: '', sentAt: this.maxSentAt() });
        },
        error: (err) => this.msg.error(orderErrorMessage(err)),
      });
  }

  /** `datetime-local` values compare correctly as strings (same fixed format). */
  private sentAtInWindow(c: AbstractControl): ValidationErrors | null {
    const value = String(c.value ?? '');
    if (!value) return null;
    return value < this.minSentAt() || value > this.maxSentAt() ? { window: true } : null;
  }

  private revokePreview(): void {
    const url = this.preview();
    if (url) URL.revokeObjectURL(url);
    this.preview.set(null);
  }
}

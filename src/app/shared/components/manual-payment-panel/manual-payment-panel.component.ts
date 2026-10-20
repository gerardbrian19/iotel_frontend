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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { Payment, PaymentReceiver } from '../../../core/models';
import {
  REFERENCE_PATTERN,
  canSendProof,
  proofUnderReview,
  receiverLabel,
  receiverTitle,
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
    NzInputNumberModule,
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
  readonly maxSentAt = localInputValue(new Date());

  readonly form = this.fb.nonNullable.group({
    referenceNumber: ['', [Validators.required, Validators.pattern(REFERENCE_PATTERN)]],
    amountSent: [0, [Validators.required, Validators.min(1)]],
    sentAt: [localInputValue(new Date()), Validators.required],
  });
  private readonly amountSent = signal(0);
  readonly amountDiffers = computed(() => {
    const sent = this.amountSent();
    return sent > 0 && Math.abs(sent - this.amount()) > 0.009;
  });

  readonly receiverLabel = receiverLabel;
  readonly receiverTitle = receiverTitle;

  constructor() {
    // Prefill the amount due until the customer types their own.
    effect(() => {
      const due = this.amount();
      untracked(() => {
        const control = this.form.controls.amountSent;
        if (!control.dirty) control.setValue(due);
      });
    });
    this.form.controls.amountSent.valueChanges.subscribe((v) =>
      this.amountSent.set(Number(v) || 0),
    );
    this.amountSent.set(this.form.controls.amountSent.value);
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
    const receiver = this.selected();
    const file = this.file();
    if (this.form.invalid || !receiver || !file) {
      this.form.markAllAsTouched();
      Object.values(this.form.controls).forEach((c) => c.markAsDirty());
      this.form.updateValueAndValidity();
      if (!file) this.fileError.set('Attach a screenshot of the transfer.');
      return;
    }
    const { referenceNumber, amountSent, sentAt } = this.form.getRawValue();
    this.busy.set(true);
    this.manual
      .submit({
        kind: this.kind(),
        id: this.targetId(),
        receiverId: receiver.id,
        referenceNumber,
        amountSent,
        sentAt: new Date(sentAt).toISOString(),
        screenshot: file,
      })
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: () => {
          this.msg.success('Thank you! We will check your payment shortly.');
          this.clearFile();
          this.form.reset({
            referenceNumber: '',
            amountSent: this.amount(),
            sentAt: localInputValue(new Date()),
          });
        },
        error: (err) => this.msg.error(orderErrorMessage(err)),
      });
  }

  private revokePreview(): void {
    const url = this.preview();
    if (url) URL.revokeObjectURL(url);
    this.preview.set(null);
  }
}

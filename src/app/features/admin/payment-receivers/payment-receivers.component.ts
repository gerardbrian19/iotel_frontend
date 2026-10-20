import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, finalize, of, switchMap } from 'rxjs';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { PaymentReceiver, PaymentReceiverInput } from '../../../core/models';
import {
  ACCOUNT_NUMBER_PATTERN,
  MAX_QR_BYTES,
  PH_BANKS,
  receiverTitle,
} from '../../../core/payments/manual-payments';
import { PaymentReceiverService } from '../../../core/services/payment-receiver.service';
import { StorageImageComponent } from '../../../shared/components/storage-image/storage-image.component';
import { imageFileError } from '../../../shared/utils/proof-image';
import { requiredTrimmed } from '../../../shared/utils/validators';

/** The bank picker's choice for a bank that isn't listed. */
const OTHER_BANK = 'Other';

/**
 * Admins: the accounts customers send GCash / bank transfers to (`/admin/payment-receivers`). Customers see only the
 * active ones, in `sortOrder`. Payments keep a copy of the account they were paid into, so editing or deleting one
 * doesn't change past payments; switching one off is the safe way to stop using it. Every change is in the activity
 * log.
 */
@Component({
  selector: 'app-admin-payment-receivers',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    NzButtonModule,
    NzFormModule,
    NzIconModule,
    NzInputModule,
    NzInputNumberModule,
    NzModalModule,
    NzPopconfirmModule,
    NzRadioModule,
    NzSelectModule,
    NzSwitchModule,
    NzTableModule,
    NzTagModule,
    StorageImageComponent,
  ],
  templateUrl: './payment-receivers.component.html',
  styleUrl: './payment-receivers.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPaymentReceiversComponent {
  private readonly service = inject(PaymentReceiverService);
  private readonly msg = inject(NzMessageService);
  private readonly fb = inject(FormBuilder);

  readonly receivers = this.service.receivers;
  readonly loading = this.service.loading;
  readonly failed = this.service.error;
  readonly banks = [...PH_BANKS, OTHER_BANK];
  readonly other = OTHER_BANK;
  readonly receiverTitle = receiverTitle;

  readonly modalVisible = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);
  /** The QR image already saved on the receiver (kept unless replaced or removed). */
  readonly qrPath = signal('');
  readonly qrFile = signal<File | null>(null);
  readonly qrPreview = signal<string | null>(null);
  readonly qrError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    type: ['gcash' as PaymentReceiver['type'], Validators.required],
    bank: ['BPI'],
    otherBank: ['', Validators.maxLength(40)],
    label: ['', Validators.maxLength(60)],
    accountName: ['', [requiredTrimmed, Validators.maxLength(100)]],
    accountNumber: ['', [requiredTrimmed, Validators.pattern(ACCOUNT_NUMBER_PATTERN)]],
    branch: ['', Validators.maxLength(80)],
    instructions: ['', Validators.maxLength(500)],
    isActive: [true],
    sortOrder: [0, [Validators.min(0), Validators.max(999)]],
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearQrFile());
  }

  openAdd(): void {
    this.editingId.set(null);
    this.form.reset({
      type: 'gcash',
      bank: 'BPI',
      isActive: true,
      sortOrder: this.receivers().length,
    });
    this.qrPath.set('');
    this.clearQrFile();
    this.modalVisible.set(true);
  }

  openEdit(r: PaymentReceiver): void {
    this.editingId.set(r.id);
    const listed = PH_BANKS.includes(r.bankName);
    this.form.reset({
      type: r.type,
      bank: r.type === 'bank' ? (listed ? r.bankName : OTHER_BANK) : 'BPI',
      otherBank: r.type === 'bank' && !listed ? r.bankName : '',
      label: r.label,
      accountName: r.accountName,
      accountNumber: r.accountNumber,
      branch: r.branch,
      instructions: r.instructions,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
    });
    this.qrPath.set(r.qrPath);
    this.clearQrFile();
    this.modalVisible.set(true);
  }

  onQrFile(event: Event): void {
    const field = event.target as HTMLInputElement;
    const file = field.files?.[0] ?? null;
    field.value = '';
    if (!file) return;
    const problem = imageFileError(file, MAX_QR_BYTES);
    this.qrError.set(problem);
    if (problem) return;
    this.clearQrFile();
    this.qrFile.set(file);
    this.qrPreview.set(URL.createObjectURL(file));
  }

  removeQr(): void {
    this.clearQrFile();
    this.qrPath.set('');
  }

  save(): void {
    if (this.saving()) return;
    const v = this.form.getRawValue();
    const bankName = v.type === 'bank' ? (v.bank === OTHER_BANK ? v.otherBank.trim() : v.bank) : '';
    if (this.form.invalid || (v.type === 'bank' && !bankName)) {
      Object.values(this.form.controls).forEach((c) => {
        c.markAsDirty();
        c.updateValueAndValidity({ onlySelf: true });
      });
      if (v.type === 'bank' && !bankName) this.msg.error('Enter the bank name.');
      return;
    }
    const editing = this.editingId();
    const id = editing ?? this.service.newId();
    const file = this.qrFile();
    const input = (qrPath: string): PaymentReceiverInput => ({
      type: v.type,
      label: v.label.trim() || (v.type === 'bank' ? bankName : 'GCash'),
      bankName,
      accountName: v.accountName,
      accountNumber: v.accountNumber.trim(),
      branch: v.branch,
      qrPath,
      instructions: v.instructions,
      isActive: v.isActive,
      sortOrder: v.sortOrder,
    });
    this.saving.set(true);
    (file ? this.service.uploadQr(id, file) : of(this.qrPath()))
      .pipe(
        switchMap(
          (qrPath): Observable<void> =>
            editing ? this.service.update(id, input(qrPath)) : this.service.add(id, input(qrPath)),
        ),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: () => {
          this.msg.success(editing ? 'Account updated' : 'Account added');
          this.modalVisible.set(false);
          this.clearQrFile();
        },
        error: (err) =>
          this.msg.error(
            err instanceof Error && !(err as { code?: string }).code
              ? err.message
              : 'Could not save the account. Only admins can change payment accounts.',
          ),
      });
  }

  setActive(r: PaymentReceiver, active: boolean): void {
    this.service.setActive(r, active).subscribe({
      next: () =>
        this.msg.success(
          active ? `Customers can pay to ${r.label} again` : `${r.label} is hidden from customers`,
        ),
      error: () =>
        this.msg.error('Could not update the account. Only admins can change payment accounts.'),
    });
  }

  remove(r: PaymentReceiver): void {
    this.service.remove(r.id).subscribe({
      next: () => this.msg.success('Account deleted'),
      error: () =>
        this.msg.error('Could not delete the account. Only admins can change payment accounts.'),
    });
  }

  private clearQrFile(): void {
    const url = this.qrPreview();
    if (url) URL.revokeObjectURL(url);
    this.qrPreview.set(null);
    this.qrFile.set(null);
    this.qrError.set(null);
  }
}

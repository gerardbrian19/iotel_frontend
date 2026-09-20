import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { authErrorMessage } from '../../../core/firebase/auth-errors';
import { Address } from '../../../core/models';
import { AddressService } from '../../../core/services/address.service';
import { AuthService } from '../../../core/services/auth.service';
import { personName, phMobile, requiredTrimmed, zipCode } from '../../../shared/utils/validators';

@Component({
  selector: 'app-addresses',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NzCardModule,
    NzButtonModule,
    NzModalModule,
    NzFormModule,
    NzInputModule,
    NzIconModule,
    NzTagModule,
    NzCheckboxModule,
    NzEmptyModule,
    NzSpinModule,
  ],
  templateUrl: './addresses.component.html',
  styleUrl: './addresses.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddressesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  private readonly addressService = inject(AddressService);
  private readonly auth = inject(AuthService);

  readonly addresses = this.addressService.addresses;
  readonly loading = this.addressService.loading;
  readonly loadFailed = this.addressService.error;
  readonly isCustomer = computed(() => this.auth.currentUser()?.role === 'customer');

  readonly modalVisible = signal(false);
  readonly saving = signal(false);
  /** Id of the address being edited, or `null` when adding a new one. */
  readonly editingId = signal<string | null>(null);
  /** The address being edited is already the default, so the default checkbox is locked on. */
  readonly editingDefault = computed(
    () => this.addresses().find(a => a.id === this.editingId())?.isDefault ?? false,
  );

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [requiredTrimmed, personName]],
    mobile: ['', [requiredTrimmed, phMobile]],
    addressLine: ['', [requiredTrimmed, Validators.maxLength(200)]],
    city: ['', [requiredTrimmed, Validators.maxLength(80)]],
    province: ['', [requiredTrimmed, Validators.maxLength(80)]],
    zip: ['', [requiredTrimmed, zipCode]],
    makeDefault: false,
  });

  openAdd(): void {
    this.editingId.set(null);
    this.form.reset({ fullName: this.auth.currentUser()?.name ?? '', makeDefault: false });
    this.modalVisible.set(true);
  }

  openEdit(addr: Address): void {
    this.editingId.set(addr.id);
    this.form.reset({ ...addr, makeDefault: addr.isDefault });
    this.modalVisible.set(true);
  }

  saveAddress(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { makeDefault, ...details } = this.form.getRawValue();
    const id = this.editingId();

    this.saving.set(true);
    const write = id
      ? this.addressService.update(id, details, makeDefault)
      : this.addressService.add(details, makeDefault);
    write.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalVisible.set(false);
        this.message.success(id ? 'Address updated' : 'Address added');
      },
      error: err => {
        this.saving.set(false);
        this.message.error(authErrorMessage(err));
      },
    });
  }

  confirmDelete(addr: Address): void {
    this.modal.confirm({
      nzTitle: 'Delete this address?',
      nzContent: addr.isDefault
        ? 'This is your default address. Your oldest remaining address will become the default. This cannot be undone.'
        : 'This action cannot be undone.',
      nzOkText: 'Delete',
      nzOkDanger: true,
      nzCancelText: 'Cancel',
      // Returning the promise keeps the dialog open with a spinner on the OK button until the delete finishes.
      nzOnOk: () =>
        new Promise<void>(resolve => {
          this.addressService.remove(addr.id).subscribe({
            next: () => {
              this.message.success('Address removed');
              resolve();
            },
            error: err => {
              this.message.error(authErrorMessage(err));
              resolve();
            },
          });
        }),
    });
  }

  setDefault(addr: Address): void {
    this.addressService.setDefault(addr.id).subscribe({
      next: () => this.message.success('Default address updated'),
      error: err => this.message.error(authErrorMessage(err)),
    });
  }

  /** Shows the validation message for a control once it has been touched. */
  errorTip(name: 'fullName' | 'mobile' | 'addressLine' | 'city' | 'province' | 'zip'): string {
    const errors = this.form.controls[name].errors;
    if (!errors) return '';
    if (errors['required']) return 'This field is required.';
    if (errors['mobile']) return 'Enter a valid PH mobile number, e.g. 09171234567.';
    if (errors['zip']) return 'ZIP code must be 4 digits.';
    if (errors['name']) return 'Use letters, spaces, dots, apostrophes and hyphens only.';
    if (errors['minlength']) return 'Too short.';
    if (errors['maxlength']) return 'Too long.';
    return 'Invalid value.';
  }
}

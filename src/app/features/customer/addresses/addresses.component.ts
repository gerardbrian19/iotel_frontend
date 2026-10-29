import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Location } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { authErrorMessage } from '../../../core/firebase/auth-errors';
import { Address } from '../../../core/models';
import { AddressService } from '../../../core/services/address.service';
import { AuthService } from '../../../core/services/auth.service';
import { MobileInputDirective } from '../../../shared/directives/mobile-input.directive';
import {
  PhAddressFieldsComponent,
  phAddressGroup,
  phAddressValue,
} from '../../../shared/components/ph-address-fields/ph-address-fields.component';
import {
  normalizeMobile,
  personName,
  phMobile,
  requiredTrimmed,
} from '../../../shared/utils/validators';

@Component({
  selector: 'app-addresses',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MobileInputDirective,
    PhAddressFieldsComponent,
    NzAlertModule,
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
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

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
    () => this.addresses().find((a) => a.id === this.editingId())?.isDefault ?? false,
  );
  /** The free-text address of one saved before the structured form, shown while it is re-entered. */
  readonly legacyAddress = signal<string | null>(null);

  private readonly addressFields = viewChild(PhAddressFieldsComponent);

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [requiredTrimmed, personName]],
    mobile: ['', [requiredTrimmed, phMobile]],
    address: phAddressGroup(this.fb.nonNullable),
    makeDefault: false,
  });

  /** Sent here from checkout (`?add=1&from=checkout`): open the form at once and go back to checkout after saving. */
  private readonly fromCheckout = this.route.snapshot.queryParamMap.get('from') === 'checkout';

  constructor() {
    if (this.route.snapshot.queryParamMap.get('add') === '1') this.openAdd();
  }

  openAdd(): void {
    this.editingId.set(null);
    this.legacyAddress.set(null);
    this.form.reset({
      fullName: this.auth.currentUser()?.name ?? '',
      address: phAddressValue(undefined, ''),
      makeDefault: false,
    });
    this.modalVisible.set(true);
  }

  openEdit(addr: Address): void {
    this.editingId.set(addr.id);
    this.legacyAddress.set(
      addr.details ? null : `${addr.addressLine}, ${addr.city}, ${addr.province} ${addr.zip}`,
    );
    // An address saved before the 11-digit rule (`+639…`, spaces) opens already converted, so it can be saved as is.
    this.form.reset({
      fullName: addr.fullName,
      mobile: normalizeMobile(addr.mobile),
      address: phAddressValue(addr.details, addr.zip),
      makeDefault: addr.isDefault,
    });
    this.modalVisible.set(true);
  }

  saveAddress(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const parts = this.addressFields()?.toShippingParts();
    if (!parts) {
      this.message.error('Please wait for the address lists to load, then try again.');
      return;
    }
    const { fullName, mobile, makeDefault } = this.form.getRawValue();
    const input = { fullName, mobile, ...parts };
    const id = this.editingId();

    this.saving.set(true);
    const write = id
      ? this.addressService.update(id, input, makeDefault)
      : this.addressService.add(input, makeDefault);
    write.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalVisible.set(false);
        this.message.success(id ? 'Address updated' : 'Address added');
        if (this.fromCheckout) void this.router.navigateByUrl('/customer/checkout');
      },
      error: (err) => {
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
        new Promise<void>((resolve) => {
          this.addressService.remove(addr.id).subscribe({
            next: () => {
              this.message.success('Address removed');
              resolve();
            },
            error: (err) => {
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
      error: (err) => this.message.error(authErrorMessage(err)),
    });
  }

  /** Shows the validation message for a control once it has been touched. */
  errorTip(name: 'fullName' | 'mobile'): string {
    const errors = this.form.controls[name].errors;
    if (!errors) return '';
    if (errors['required']) return 'This field is required.';
    if (errors['mobile']) return errors['mobile'];
    if (errors['name']) return 'Use letters, spaces, dots, apostrophes and hyphens only.';
    if (errors['minlength']) return 'Too short.';
    if (errors['maxlength']) return 'Too long.';
    return 'Invalid value.';
  }

  /** Back to the page the customer came from (user menu, checkout, assistant); the catalog if they landed here. */
  goBack(): void {
    // The router numbers its navigations in history.state; 1 means this page was the first one loaded.
    if ((history.state?.navigationId ?? 1) > 1) this.location.back();
    else this.router.navigateByUrl('/customer/catalog');
  }
}

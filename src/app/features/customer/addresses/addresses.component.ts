import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzMessageService } from 'ng-zorro-antd/message';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { inject } from '@angular/core';
import { ShippingAddress } from '../../../core/models';

const MOCK_ADDRESSES: (ShippingAddress & { id: number; isDefault: boolean })[] = [
  { id: 1, fullName: 'John Santos', addressLine: '123 Quezon Blvd', city: 'Quezon City', province: 'Metro Manila', zip: '1100', mobile: '09171234567', isDefault: true },
  { id: 2, fullName: 'John Santos', addressLine: '456 Taft Ave', city: 'Manila', province: 'Metro Manila', zip: '1004', mobile: '09171234567', isDefault: false },
];

@Component({
  selector: 'app-addresses',
  standalone: true,
  imports: [ReactiveFormsModule, NzCardModule, NzButtonModule, NzModalModule, NzFormModule, NzInputModule, NzIconModule, NzTagModule],
  templateUrl: './addresses.component.html',
  styleUrl: './addresses.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddressesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);

  readonly addresses = signal([...MOCK_ADDRESSES]);
  readonly modalVisible = signal(false);
  readonly editingId = signal<number | null>(null);

  readonly form = this.fb.group({
    fullName: ['', Validators.required],
    addressLine: ['', Validators.required],
    city: ['', Validators.required],
    province: ['', Validators.required],
    zip: ['', Validators.required],
    mobile: ['', Validators.required],
  });

  openAdd(): void {
    this.editingId.set(null);
    this.form.reset();
    this.modalVisible.set(true);
  }

  openEdit(addr: typeof MOCK_ADDRESSES[0]): void {
    this.editingId.set(addr.id);
    this.form.patchValue(addr);
    this.modalVisible.set(true);
  }

  saveAddress(): void {
    if (this.form.invalid) return;
    const val = this.form.value as ShippingAddress;
    if (this.editingId()) {
      this.addresses.update(list => list.map(a => a.id === this.editingId() ? { ...a, ...val } : a));
      this.message.success('Address updated');
    } else {
      this.addresses.update(list => [...list, { ...val, id: Date.now(), isDefault: false }]);
      this.message.success('Address added');
    }
    this.modalVisible.set(false);
  }

  confirmDelete(id: number): void {
    this.modal.confirm({
      nzTitle: 'Delete this address?',
      nzContent: 'This action cannot be undone.',
      nzOkText: 'Delete',
      nzOkDanger: true,
      nzCancelText: 'Cancel',
      nzOnOk: () => {
        this.addresses.update(list => list.filter(a => a.id !== id));
        this.message.success('Address removed');
      },
    });
  }

  setDefault(id: number): void {
    this.addresses.update(list => list.map(a => ({ ...a, isDefault: a.id === id })));
  }
}

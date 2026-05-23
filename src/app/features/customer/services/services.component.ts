import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { BookingService } from '../../../core/services/booking.service';
import { AuthService } from '../../../core/services/auth.service';
import { Booking, Service } from '../../../core/models';

const BOOKING_STATUS_COLORS: Record<Booking['status'], string> = {
  Pending: 'warning',
  Confirmed: 'success',
  Cancelled: 'error',
};

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [
    CurrencyPipe, DatePipe, FormsModule, ReactiveFormsModule,
    NzCardModule, NzButtonModule, NzModalModule, NzTabsModule,
    NzTagModule, NzFormModule, NzInputModule, NzSelectModule,
    NzDatePickerModule, NzIconModule, NzEmptyModule,
  ],
  templateUrl: './services.component.html',
  styleUrl: './services.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicesComponent implements OnInit {
  private readonly bookingService = inject(BookingService);
  private readonly auth = inject(AuthService);
  private readonly msg = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  private readonly fb = inject(FormBuilder);

  readonly BOOKING_STATUS_COLORS = BOOKING_STATUS_COLORS;
  readonly services = signal<Service[]>([]);
  readonly bookings = signal<Booking[]>([]);
  readonly modalVisible = signal(false);
  readonly selectedService = signal<Service | null>(null);

  readonly form = this.fb.group({
    serviceId: [0, [Validators.required, Validators.min(1)]],
    preferredDate: [null as Date | null, Validators.required],
    preferredTime: ['10:00', Validators.required],
    customerName: ['', Validators.required],
    customerEmail: ['', [Validators.required, Validators.email]],
    customerMobile: ['', Validators.required],
  });

  ngOnInit(): void {
    this.bookingService.getServices().subscribe(s => this.services.set(s));
    const user = this.auth.currentUser();
    if (user) {
      this.bookingService.getBookings(user.id).subscribe(b => this.bookings.set(b));
      this.form.patchValue({ customerName: user.name, customerEmail: user.email });
    }
  }

  openBooking(service?: Service): void {
    if (service) {
      this.selectedService.set(service);
      this.form.patchValue({ serviceId: service.id });
    }
    this.modalVisible.set(true);
  }

  book(): void {
    if (this.form.invalid) return;
    const user = this.auth.currentUser()!;
    const v = this.form.value;
    const svc = this.services().find(s => s.id === v.serviceId)!;
    const dateStr = (v.preferredDate as Date).toISOString().split('T')[0];
    this.bookingService.create({
      serviceId: svc.id,
      serviceName: svc.title,
      customerId: user.id,
      customerName: v.customerName!,
      customerEmail: v.customerEmail!,
      customerMobile: v.customerMobile!,
      preferredDate: dateStr,
      preferredTime: v.preferredTime!,
      status: 'Pending',
    }).subscribe(b => {
      this.bookings.update(list => [...list, b]);
      this.msg.success('Booking submitted successfully!');
      this.modalVisible.set(false);
      this.form.reset({ preferredTime: '10:00', customerName: user.name, customerEmail: user.email });
    });
  }

  confirmCancel(id: number): void {
    this.modal.confirm({
      nzTitle: 'Cancel this booking?',
      nzContent: 'Are you sure you want to cancel this booking?',
      nzOkText: 'Yes, cancel it',
      nzOkDanger: true,
      nzCancelText: 'Keep booking',
      nzOnOk: () => this.cancelBooking(id),
    });
  }

  cancelBooking(id: number): void {
    this.bookingService.cancel(id).subscribe(() => {
      this.bookings.update(list => list.map(b => b.id === id ? { ...b, status: 'Cancelled' } : b));
      this.msg.success('Booking cancelled');
    });
  }
}

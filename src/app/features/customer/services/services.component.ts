import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzEmptyModule } from 'ng-zorro-antd/empty';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { BOOKING_NOTES_MIN, BookingService, bookingErrorMessage } from '../../../core/services/booking.service';
import { AuthService } from '../../../core/services/auth.service';
import { Service } from '../../../core/models';
import { BookingPanelComponent } from '../../../shared/components/booking-panel/booking-panel.component';
import { SlotPickerComponent } from '../../../shared/components/slot-picker/slot-picker.component';
import { MobileInputDirective } from '../../../shared/directives/mobile-input.directive';
import {
  emailFormat,
  minLengthTrimmed,
  normalizeMobile,
  personName,
  phMobile,
  requiredTrimmed,
} from '../../../shared/utils/validators';

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [
    CurrencyPipe, ReactiveFormsModule, MobileInputDirective,
    NzCardModule, NzButtonModule, NzIconModule, NzModalModule, NzTabsModule,
    NzFormModule, NzInputModule, NzSelectModule, NzEmptyModule, NzSpinModule, NzAlertModule,
    BookingPanelComponent, SlotPickerComponent,
  ],
  templateUrl: './services.component.html',
  styleUrl: './services.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicesComponent {
  private readonly bookingService = inject(BookingService);
  private readonly auth = inject(AuthService);
  private readonly msg = inject(NzMessageService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  /** Set when PayMongo sends the customer back: `?booking=<id>&payment=success|cancelled`. */
  readonly booking = input<string>();
  readonly payment = input<string>();
  /** Back from PayMongo: open My Bookings. */
  readonly tabIndex = linkedSignal<number>(() => (this.booking() ? 1 : 0));
  /** The booking the customer just paid (or left the checkout of), with how it went. */
  readonly returned = computed(() => {
    const id = this.booking();
    const booking = id ? this.bookingService.byId().get(id) : undefined;
    if (!booking) return null;
    const paid = booking.payment?.status === 'Paid';
    if (paid) return { type: 'success' as const, text: `Payment received. Your ${booking.serviceName} booking is confirmed. Thank you!` };
    return this.payment() === 'success'
      ? { type: 'info' as const, text: 'PayMongo is confirming your payment. This updates by itself in a moment.' }
      : { type: 'warning' as const, text: 'The payment was not completed. You can pay again from the booking below.' };
  });

  readonly services = this.bookingService.services;
  readonly loading = this.bookingService.loading;
  readonly loadFailed = this.bookingService.error;
  readonly modalVisible = signal(false);
  readonly submitting = signal(false);
  readonly preferredDate = signal<string | null>(null);
  readonly preferredTime = signal<string | null>(null);
  /** Set by the first Submit press, so the missing slot is flagged only after that. */
  readonly submitAttempted = signal(false);
  readonly slotMissing = computed(() => this.submitAttempted() && (!this.preferredDate() || !this.preferredTime()));

  /** Bookings still in progress first (soonest date first), then finished and cancelled ones, newest first. */
  readonly bookings = computed(() => {
    const all = this.bookingService.bookings();
    const inProgress = (status: string) => status === 'Pending' || status === 'Confirmed' || status === 'Paid';
    const active = all
      .filter(b => inProgress(b.status))
      .sort((a, b) => (a.preferredDate + a.preferredTime).localeCompare(b.preferredDate + b.preferredTime));
    return [...active, ...all.filter(b => !inProgress(b.status))];
  });

  readonly form = this.fb.group({
    serviceId: ['', Validators.required],
    customerName: ['', [requiredTrimmed, personName]],
    customerEmail: ['', [requiredTrimmed, emailFormat, Validators.maxLength(100)]],
    customerMobile: ['', [requiredTrimmed, phMobile]],
    // Staff need to know the job before they can quote it.
    notes: ['', [requiredTrimmed, minLengthTrimmed(BOOKING_NOTES_MIN), Validators.maxLength(1000)]],
  });

  private readonly serviceId = signal('');
  readonly selectedService = computed(() => this.services().find(s => s.id === this.serviceId()) ?? null);

  constructor() {
    this.form.controls.serviceId.valueChanges.subscribe(id => this.serviceId.set(id ?? ''));
    // The profile may finish loading after the page opens.
    effect(() => {
      const user = this.auth.currentUser();
      if (user && !this.form.controls.customerName.dirty) {
        this.form.patchValue({ customerName: user.name, customerEmail: user.email }, { emitEvent: false });
      }
      if (user?.phone && !this.form.controls.customerMobile.dirty) {
        this.form.patchValue({ customerMobile: normalizeMobile(user.phone) }, { emitEvent: false });
      }
    });
  }

  openBooking(service?: Service): void {
    if (service) this.form.controls.serviceId.setValue(service.id);
    this.modalVisible.set(true);
  }

  book(): void {
    if (this.submitting()) return;
    this.submitAttempted.set(true);
    const service = this.selectedService();
    const date = this.preferredDate();
    const time = this.preferredTime();
    if (this.form.invalid || !service || !date || !time) {
      // Shows every field's message, not only the ones already typed in.
      Object.values(this.form.controls).forEach(c => {
        c.markAsDirty();
        c.updateValueAndValidity({ onlySelf: true });
      });
      this.msg.warning('Please complete all the required fields to submit your booking.');
      return;
    }

    const v = this.form.getRawValue();
    this.submitting.set(true);
    this.bookingService
      .create({
        service,
        preferredDate: date,
        preferredTime: time,
        customerName: v.customerName!,
        customerEmail: v.customerEmail!,
        customerMobile: v.customerMobile!,
        notes: v.notes ?? '',
      })
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: ({ conversationId }) => {
          this.msg.success('Booking request sent. Chat with our team to agree on the quotation.');
          this.modalVisible.set(false);
          this.resetForm();
          this.router.navigate(['/customer/messages'], { queryParams: { conversation: conversationId } });
        },
        error: err => this.msg.error(bookingErrorMessage(err)),
      });
  }

  errorTip(name: 'customerName' | 'customerEmail' | 'customerMobile' | 'notes'): string {
    const errors = this.form.controls[name].errors;
    if (!errors) return '';
    if (name === 'notes') {
      if (errors['required']) return 'Please describe what you need done.';
      if (errors['minlength']) return `Please add a bit more detail (at least ${BOOKING_NOTES_MIN} characters).`;
    }
    if (errors['required']) return 'This field is required.';
    if (errors['email']) return 'Enter a valid email address.';
    if (errors['mobile']) return errors['mobile'];
    if (errors['name']) return 'Use letters, spaces, dots, apostrophes and hyphens only.';
    if (errors['minlength']) return 'Too short.';
    if (errors['maxlength']) return 'Too long.';
    return 'Invalid value.';
  }

  private resetForm(): void {
    const user = this.auth.currentUser();
    this.form.reset({ serviceId: '', customerName: user?.name ?? '', customerEmail: user?.email ?? '', customerMobile: normalizeMobile(user?.phone ?? ''), notes: '' });
    this.preferredDate.set(null);
    this.submitAttempted.set(false);
    this.preferredTime.set(null);
  }

  /** Back / Cancel / Esc / click outside. Kept open while the booking is being submitted. */
  closeBooking(): void {
    if (!this.submitting()) this.modalVisible.set(false);
  }
}

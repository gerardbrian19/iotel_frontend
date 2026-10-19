import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { Observable } from 'rxjs';
import { servicePriceLabel } from '../../../core/booking/service-view';
import {
  SERVICE_MAX_PRICE, SERVICE_PRICING, SERVICE_PRICING_LABELS, Service, ServicePricing,
} from '../../../core/models';
import { BookingService } from '../../../core/services/booking.service';
import { PLACEHOLDER_IMAGE, onImageError } from '../../utils/product-image';
import { requiredTrimmed } from '../../utils/validators';

/** A site image (`/images/…`) or a web address (same rule as product images). */
const IMAGE_URL_RE = /^(\/\S+|https?:\/\/\S+)$/i;

type StatusFilter = 'All' | 'Active' | 'Inactive';

/**
 * Service catalog management for admins and staff (`/admin/services`, `/staff/services`). Both roles have the same
 * actions; firestore.rules (`match /services`) is what actually allows them. Services are never deleted: switching
 * one off (Active) hides it from customers and stops new bookings, while its bookings keep their history.
 */
@Component({
  selector: 'app-services-manager',
  standalone: true,
  imports: [
    FormsModule, ReactiveFormsModule,
    NzTableModule, NzTagModule, NzButtonModule, NzInputModule, NzIconModule, NzSelectModule, NzModalModule,
    NzFormModule, NzSwitchModule, NzInputNumberModule, NzAlertModule,
  ],
  templateUrl: './services-manager.component.html',
  styleUrl: './services-manager.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicesManagerComponent {
  private readonly bookingService = inject(BookingService);
  private readonly msg = inject(NzMessageService);
  private readonly fb = inject(FormBuilder);

  readonly pricingOptions = SERVICE_PRICING.map(value => ({ value, label: SERVICE_PRICING_LABELS[value] }));
  readonly priceLabel = servicePriceLabel;
  readonly maxPrice = SERVICE_MAX_PRICE;
  readonly placeholder = PLACEHOLDER_IMAGE;
  readonly onImageError = onImageError;

  readonly search = signal('');
  readonly categoryFilter = signal('All');
  readonly statusFilter = signal<StatusFilter>('All');
  readonly modalVisible = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);

  readonly services = this.bookingService.services;
  /** How many bookings refer to each service (shown in the table). */
  readonly bookingCounts = this.bookingService.bookingCountByService;
  readonly bookingsFailed = this.bookingService.error;

  readonly form = this.fb.nonNullable.group({
    title: ['', [requiredTrimmed, Validators.maxLength(100)]],
    description: ['', [requiredTrimmed, Validators.maxLength(500)]],
    category: ['', Validators.maxLength(60)],
    pricing: ['starting' as ServicePricing, Validators.required],
    price: [null as number | null, [Validators.required, Validators.min(0), Validators.max(SERVICE_MAX_PRICE)]],
    duration: ['', Validators.maxLength(60)],
    isActive: [true],
    imageUrl: ['', Validators.pattern(IMAGE_URL_RE)],
  });

  /** Categories already used by some service, for the filter. */
  readonly categories = computed(() =>
    [...new Set(this.services().map(s => s.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
  );

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const category = this.categoryFilter();
    const status = this.statusFilter();
    return this.services()
      .filter(s => category === 'All' || s.category === category)
      .filter(s => status === 'All' || s.isActive === (status === 'Active'))
      .filter(s => !q || `${s.title} ${s.description} ${s.category}`.toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title));
  });

  constructor() {
    // A quotation-only service has no published price.
    this.form.controls.pricing.valueChanges.subscribe(pricing => this.syncPriceControl(pricing));
  }

  openAdd(): void {
    this.editingId.set(null);
    this.form.reset({ pricing: 'starting', price: null, isActive: true });
    this.syncPriceControl('starting');
    this.modalVisible.set(true);
  }

  openEdit(s: Service): void {
    this.editingId.set(s.id);
    this.form.reset({
      title: s.title, description: s.description, category: s.category, pricing: s.pricing,
      price: s.pricing === 'quote' ? null : s.price, duration: s.duration, isActive: s.isActive, imageUrl: s.imageUrl,
    });
    this.syncPriceControl(s.pricing);
    this.modalVisible.set(true);
  }

  save(): void {
    if (this.saving()) return;
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach(c => {
        c.markAsDirty();
        c.updateValueAndValidity({ onlySelf: true });
      });
      return;
    }
    const v = this.form.getRawValue();
    const input = {
      title: v.title, description: v.description, category: v.category, pricing: v.pricing,
      price: v.pricing === 'quote' ? 0 : (v.price ?? 0), duration: v.duration, isActive: v.isActive, imageUrl: v.imageUrl,
    };
    const id = this.editingId();
    this.saving.set(true);
    const request: Observable<unknown> = id
      ? this.bookingService.updateService(id, input)
      : this.bookingService.addService(input);
    request.subscribe({
      next: () => {
        this.msg.success(id ? 'Service updated' : 'Service added');
        this.modalVisible.set(false);
        this.saving.set(false);
      },
      error: () => {
        this.msg.error('Could not save the service. You may not have permission.');
        this.saving.set(false);
      },
    });
  }

  setActive(s: Service, active: boolean): void {
    this.bookingService.setServiceActive(s.id, active).subscribe({
      next: () => this.msg.success(active ? `${s.title} is bookable again` : `${s.title} can no longer be booked`),
      error: () => this.msg.error('Could not update the service. You may not have permission.'),
    });
  }

  private syncPriceControl(pricing: ServicePricing): void {
    const price = this.form.controls.price;
    if (pricing === 'quote') {
      price.setValue(null, { emitEvent: false });
      price.disable({ emitEvent: false });
    } else {
      price.enable({ emitEvent: false });
    }
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { map, startWith, switchMap } from 'rxjs';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSelectModule, NzSelectOptionInterface } from 'ng-zorro-antd/select';
import { AddressArea, AddressDetails, ShippingAddress } from '../../../core/models';
import { PhLocationService, PhPlace } from '../../../core/services/ph-location.service';
import { requiredTrimmed, zipCode } from '../../utils/validators';

/** Field lengths; together with the longest barangay name they keep `addressLine` within its 200-character limit. */
export const ADDRESS_PART_LIMITS = { unit: 35, house: 30, street: 50, subdivision: 30 } as const;
const METRO_MANILA = 'Metro Manila';

export type PhAddressForm = FormGroup<{
  unit: FormControl<string>;
  house: FormControl<string>;
  street: FormControl<string>;
  subdivision: FormControl<string>;
  area: FormControl<AddressArea | ''>;
  provinceCode: FormControl<string>;
  cityCode: FormControl<string>;
  barangayCode: FormControl<string>;
  zip: FormControl<string>;
}>;

/** A province is required unless the address is in Metro Manila. */
function provinceRequired(c: AbstractControl): ValidationErrors | null {
  return c.parent?.get('area')?.value === 'ncr' || c.value ? null : { required: true };
}

/** At least one of the four address lines has to say where in the barangay the address is. */
function addressLineRequired(g: AbstractControl): ValidationErrors | null {
  const v = g.value as Partial<Record<keyof typeof ADDRESS_PART_LIMITS, string>>;
  return [v.unit, v.house, v.street, v.subdivision].some((s) => s?.trim())
    ? null
    : { addressLine: true };
}

/** The form group `app-ph-address-fields` edits. */
export function phAddressGroup(fb: NonNullableFormBuilder): PhAddressForm {
  return fb.group(
    {
      unit: ['', Validators.maxLength(ADDRESS_PART_LIMITS.unit)],
      house: ['', Validators.maxLength(ADDRESS_PART_LIMITS.house)],
      street: ['', Validators.maxLength(ADDRESS_PART_LIMITS.street)],
      subdivision: ['', Validators.maxLength(ADDRESS_PART_LIMITS.subdivision)],
      area: fb.control<AddressArea | ''>('', Validators.required),
      provinceCode: ['', provinceRequired],
      cityCode: ['', Validators.required],
      barangayCode: ['', Validators.required],
      zip: ['', [requiredTrimmed, zipCode]],
    },
    { validators: addressLineRequired },
  );
}

/** The group's value for a saved address; an address saved before the structured form starts empty except its ZIP. */
export function phAddressValue(
  details: AddressDetails | undefined,
  zip: string,
): PhAddressForm['value'] {
  return {
    unit: details?.unit ?? '',
    house: details?.house ?? '',
    street: details?.street ?? '',
    subdivision: details?.subdivision ?? '',
    area: details?.area ?? '',
    provinceCode: details?.provinceCode ?? '',
    cityCode: details?.cityCode ?? '',
    barangayCode: details?.barangayCode ?? '',
    zip,
  };
}

/**
 * Philippine address fields, laid out like government (SSS) forms: four address lines, Metro Manila / Province,
 * then dependent dropdowns (province → city/municipality → barangay) from the PSA's PSGC lists, and the ZIP code.
 * Changing a selection clears the ones below it that no longer belong to it. The parent owns the group
 * (`phAddressGroup`) and reads the result with `toShippingParts()`.
 */
@Component({
  selector: 'app-ph-address-fields',
  standalone: true,
  imports: [ReactiveFormsModule, NzFormModule, NzInputModule, NzRadioModule, NzSelectModule],
  templateUrl: './ph-address-fields.component.html',
  styleUrl: './ph-address-fields.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhAddressFieldsComponent {
  private readonly locations = inject(PhLocationService);

  readonly group = input.required<PhAddressForm>();
  readonly limits = ADDRESS_PART_LIMITS;

  /** The group's value, refreshed on every form event (value, status, touched, submit). */
  private readonly state = toSignal(
    toObservable(this.group).pipe(
      switchMap((g) =>
        g.events.pipe(
          startWith(null),
          map(() => ({ g, value: g.getRawValue() })),
        ),
      ),
    ),
  );

  readonly index = this.locations.index;
  readonly indexError = this.locations.indexError;
  readonly area = computed(() => this.state()?.value.area ?? '');
  private readonly provinceCode = computed(() => this.state()?.value.provinceCode ?? '');
  private readonly cityCode = computed(() => this.state()?.value.cityCode ?? '');

  readonly provinceOptions = computed(() => toOptions(this.index()?.provinces ?? []));
  /** Cities of the chosen area, or `null` while the lists are loading. */
  private readonly cities = computed<PhPlace[] | null>(() => {
    const index = this.index();
    if (!index) return null;
    if (this.area() === 'ncr') return index.ncr;
    if (this.area() !== 'province') return [];
    return index.provinces.find((p) => p.code === this.provinceCode())?.cities ?? [];
  });
  readonly cityOptions = computed(() => toOptions(this.cities() ?? []));

  /** Barangay file of the chosen area: `ncr` or the province code. */
  private readonly barangayArea = computed(() =>
    this.area() === 'ncr' ? 'ncr' : this.area() === 'province' ? this.provinceCode() : '',
  );
  private readonly barangays = computed(() => {
    const area = this.barangayArea();
    const city = this.cityCode();
    return area && city ? this.locations.barangays(area, city) : null;
  });
  readonly barangayOptions = computed(() => toOptions(this.barangays() ?? []));
  readonly barangaysLoading = computed(() =>
    this.locations.loadingAreas().has(this.barangayArea()),
  );
  readonly barangaysFailed = computed(() => this.locations.failedAreas().has(this.barangayArea()));

  readonly cityDisabled = computed(
    () => !this.area() || (this.area() === 'province' && !this.provinceCode()),
  );
  readonly cityPlaceholder = computed(() =>
    !this.area()
      ? 'Choose Metro Manila or Province first'
      : this.cityDisabled()
        ? 'Select a province first'
        : 'Select City/Municipality',
  );
  readonly barangayDisabled = computed(() => this.cityDisabled() || !this.cityCode());

  /** "Enter at least one address line", once the lines have been touched or the form submitted. */
  readonly lineError = computed(() => {
    const g = this.state()?.g;
    if (!g?.hasError('addressLine')) return false;
    const { unit, house, street, subdivision } = g.controls;
    return [unit, house, street, subdivision].some((c) => c.touched);
  });

  constructor() {
    void this.locations.loadIndex();

    // Load the barangays of the chosen area once a city is picked (also when an existing address is opened).
    effect(() => {
      const area = this.barangayArea();
      if (area && this.cityCode()) void this.locations.loadBarangays(area);
    });

    // Clear selections that no longer fit the ones above them, e.g. after switching Metro Manila ↔ Province.
    effect(() => {
      const g = this.state()?.g;
      const cities = this.cities();
      const barangays = this.barangays();
      const area = this.area();
      if (!g) return;
      untracked(() => {
        const { provinceCode, cityCode, barangayCode } = g.controls;
        if (area === 'ncr' && provinceCode.value) provinceCode.setValue('');
        if (cities && cityCode.value && !cities.some((c) => c.code === cityCode.value)) {
          cityCode.setValue('');
          barangayCode.setValue('');
        } else if (
          barangays &&
          barangayCode.value &&
          !barangays.some((b) => b.code === barangayCode.value)
        ) {
          barangayCode.setValue('');
        }
      });
    });

    // Whether a province is required depends on the area, so re-check it when the area changes.
    effect(() => {
      this.area();
      untracked(() => this.state()?.g.controls.provinceCode.updateValueAndValidity());
    });
  }

  retryBarangays(): void {
    void this.locations.loadBarangays(this.barangayArea());
  }

  retryIndex(): void {
    void this.locations.loadIndex();
  }

  /**
   * The saved form of the group's value: the structured details plus the flat address fields orders keep.
   * `null` if a selection can't be resolved to a name (lists not loaded); the group should be valid first.
   */
  toShippingParts():
    | (Pick<ShippingAddress, 'addressLine' | 'city' | 'province' | 'zip'> & {
        details: AddressDetails;
      })
    | null {
    const v = this.group().getRawValue();
    const index = this.index();
    if (!index || !v.area) return null;
    const province =
      v.area === 'ncr'
        ? METRO_MANILA
        : index.provinces.find((p) => p.code === v.provinceCode)?.name;
    const city = this.cities()?.find((c) => c.code === v.cityCode)?.name;
    const barangay = this.barangays()?.find((b) => b.code === v.barangayCode)?.name;
    if (!province || !city || !barangay) return null;
    const lines = [v.unit, v.house, v.street, v.subdivision].map((s) => s.trim());
    return {
      addressLine: [...lines, barangay].filter(Boolean).join(', '),
      city,
      province,
      zip: v.zip.trim(),
      details: {
        unit: lines[0],
        house: lines[1],
        street: lines[2],
        subdivision: lines[3],
        area: v.area,
        provinceCode: v.area === 'ncr' ? '' : v.provinceCode,
        cityCode: v.cityCode,
        barangayCode: v.barangayCode,
        barangay,
      },
    };
  }
}

function toOptions(places: PhPlace[]): NzSelectOptionInterface[] {
  return places.map((p) => ({ label: p.name, value: p.code }));
}

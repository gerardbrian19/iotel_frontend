import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^\p{L}[\p{L} .'-]*$/u;

const isEmpty = (v: unknown): boolean => v === null || v === undefined || v === '';

/** Like `Validators.required`, but whitespace-only counts as empty. */
export const requiredTrimmed: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  typeof c.value === 'string' && c.value.trim() === '' ? { required: true } : null;

/** Stricter than `Validators.email`: needs a dot in the domain (`a@b` is rejected). */
export const emailFormat: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  isEmpty(c.value) || EMAIL_RE.test(String(c.value).trim()) ? null : { email: true };

/** Common misspellings of `gmail.com`'s domain (`ggmail.com`, `gmial.com`, ...). */
const GMAIL_TYPOS = new Set([
  'ggmail.com',
  'gmial.com',
  'gmali.com',
  'gmai.com',
  'gmil.com',
  'gnail.com',
  'gmaill.com',
  'gamil.com',
  'gmail.co',
  'gmail.cm',
  'gmail.con',
  'gmail.comm',
  'gmail.net',
]);

/** Rejects a misspelled `gmail.com` domain, e.g. `someone@ggmail.com`. */
export const emailDomainTypo: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  if (isEmpty(c.value)) return null;
  const domain = String(c.value).trim().toLowerCase().split('@').pop() ?? '';
  return GMAIL_TYPOS.has(domain) ? { emailTypo: true } : null;
};

/** 2–60 characters, letters plus spaces, dots, apostrophes and hyphens. */
export const personName: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  if (isEmpty(c.value)) return null;
  const v = String(c.value).trim();
  if (v.length < 2) return { minlength: true };
  if (v.length > 60) return { maxlength: true };
  return NAME_RE.test(v) ? null : { name: true };
};

/** The message for a missing or invalid full name (`personName`), or null when it is valid. For non-reactive forms. */
export function personNameError(value: string): string | null {
  if (value.trim() === '') return 'Full name is required.';
  const errors = personName({ value } as AbstractControl);
  if (!errors) return null;
  if (errors['minlength']) return 'Full name must be at least 2 characters.';
  if (errors['maxlength']) return 'Full name must be at most 60 characters.';
  return 'Use letters, spaces, dots, apostrophes and hyphens only.';
}

/** Philippine mobile number: exactly 11 digits, `09XXXXXXXXX`. No spaces, symbols or `+63`. */
export const phMobile: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const problem = mobileError(c.value);
  return problem ? { mobile: problem } : null;
};

/** Digits in a PH mobile number (`09XXXXXXXXX`). Mirrored in firestore.rules and functions/src/payments.ts. */
export const MOBILE_DIGITS = 11;
const PH_MOBILE_RE = /^09\d{9}$/;

/**
 * A mobile number as typed, pasted, autofilled or saved before the 11-digit rule, in the `09XXXXXXXXX` form: the
 * country code (`+63`/`63` before a 9) becomes `0`, and everything but digits is dropped. It does not validate.
 * Mirrored by `localMobile` in functions/src/payments.ts.
 */
export function normalizeMobile(value: string): string {
  return value.replace(/[^\d+]/g, '').replace(/^\+?63(?=9)/, '0').replace(/\D/g, '');
}

/** The message for an invalid PH mobile number, or null when it is valid or empty. */
export function mobileError(value: unknown): string | null {
  if (isEmpty(value)) return null;
  const v = String(value);
  if (!/^\d+$/.test(v) || v.length !== MOBILE_DIGITS)
    return 'Mobile number must be exactly 11 digits.';
  return PH_MOBILE_RE.test(v) ? null : 'Mobile number must start with 09, e.g. 09171234567.';
}

/** At least `min` characters once leading/trailing whitespace is ignored (empty is left to `requiredTrimmed`). */
export const minLengthTrimmed =
  (min: number): ValidatorFn =>
  (c: AbstractControl): ValidationErrors | null => {
    if (isEmpty(c.value)) return null;
    const length = String(c.value).trim().length;
    return length > 0 && length < min ? { minlength: { requiredLength: min, actualLength: length } } : null;
  };

/** Philippine ZIP code: exactly 4 digits. */
export const zipCode: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  isEmpty(c.value) || /^\d{4}$/.test(String(c.value).trim()) ? null : { zip: true };

/** At least 8 characters, containing a letter and a number. */
export const strongPassword: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  if (isEmpty(c.value)) return null;
  const v = String(c.value);
  if (v.length < 8) return { minlength: true };
  if (v.length > 64) return { maxlength: true };
  return /[A-Za-z]/.test(v) && /\d/.test(v) ? null : { weakPassword: true };
};

/** Control must equal its sibling control named `otherName`. Re-run it when the sibling changes. */
export const matchesControl =
  (otherName: string): ValidatorFn =>
  (c: AbstractControl): ValidationErrors | null => {
    const other = c.parent?.get(otherName);
    return other && c.value !== other.value ? { mismatch: true } : null;
  };

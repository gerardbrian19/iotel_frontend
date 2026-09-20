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

/** 2–60 characters, letters plus spaces, dots, apostrophes and hyphens. */
export const personName: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  if (isEmpty(c.value)) return null;
  const v = String(c.value).trim();
  if (v.length < 2) return { minlength: true };
  if (v.length > 60) return { maxlength: true };
  return NAME_RE.test(v) ? null : { name: true };
};

/** Philippine mobile number: `09XXXXXXXXX` or `+639XXXXXXXXX`; spaces and dashes are ignored. */
export const phMobile: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  isEmpty(c.value) || /^(\+63|0)9\d{9}$/.test(String(c.value).replace(/[\s-]/g, ''))
    ? null
    : { mobile: true };

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

import { Directive, inject } from '@angular/core';
import { NgControl } from '@angular/forms';
import { MOBILE_DIGITS, normalizeMobile } from '../utils/validators';

/**
 * Mobile number inputs: digits only, at most 11. Whatever is typed, pasted or autofilled is put in the `09XXXXXXXXX`
 * form (`+63 917 123 4567` → `09171234567`, see `normalizeMobile`), so the field stops accepting characters at 11
 * digits. There is no `maxlength` attribute on purpose: the browser would cut an autofilled `+63 …` short before it
 * could be converted. The `phMobile` validator still checks the value.
 */
@Directive({
  selector: 'input[appMobileInput]',
  standalone: true,
  host: {
    inputmode: 'numeric',
    '(input)': 'onInput($event)',
    '(paste)': 'onPaste($event)',
  },
})
export class MobileInputDirective {
  private readonly ngControl = inject(NgControl, { self: true, optional: true });

  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.apply(input, input.value);
  }

  onPaste(event: ClipboardEvent): void {
    const input = event.target as HTMLInputElement;
    const text = event.clipboardData?.getData('text') ?? '';
    event.preventDefault();
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    // A pasted number replaces the selection; on its own it is converted as a whole, so its `+63` is recognised.
    const raw =
      start === 0 && end === input.value.length
        ? text
        : input.value.slice(0, start) + text + input.value.slice(end);
    this.apply(input, raw);
  }

  private apply(input: HTMLInputElement, raw: string): void {
    const clean = normalizeMobile(raw).slice(0, MOBILE_DIGITS);
    if (clean === input.value && clean === this.ngControl?.value) return;
    input.value = clean;
    // Works for reactive forms and ngModel alike, whichever order the value accessor's own input listener runs in.
    this.ngControl?.control?.setValue(clean, { emitModelToViewChange: false });
    this.ngControl?.viewToModelUpdate(clean);
  }
}

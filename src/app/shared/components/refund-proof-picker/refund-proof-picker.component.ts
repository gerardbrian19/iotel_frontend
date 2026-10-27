import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  model,
  signal,
  untracked,
} from '@angular/core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { imageFileError } from '../../utils/proof-image';

/**
 * Staff: an optional screenshot of a refund they sent back themselves (GCash or bank), shown to the customer once the
 * refund is recorded. Two-way bound: `[(file)]`. Used in the order and booking refund dialogs.
 */
@Component({
  selector: 'app-refund-proof-picker',
  standalone: true,
  imports: [NzButtonModule, NzIconModule],
  template: `
    <div class="rp">
      <input
        #picker
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        (change)="onFile($event)"
      />
      @if (preview(); as src) {
        <img [src]="src" alt="Selected refund screenshot" class="rp-preview" />
        <button nz-button nzSize="small" type="button" (click)="clear()">Remove</button>
      }
      <button nz-button nzSize="small" type="button" (click)="picker.click()">
        <span nz-icon nzType="upload"></span>
        {{ file() ? 'Choose another' : 'Attach screenshot (optional)' }}
      </button>
      @if (error(); as message) {
        <span class="rp-error">{{ message }}</span>
      } @else if (!file()) {
        <span class="rp-hint">JPG, PNG or WebP, up to 5 MB. The customer sees it.</span>
      }
    </div>
  `,
  styles: `
    .rp {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
    }
    .rp-preview {
      width: 56px;
      height: 56px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid #e8e8e8;
    }
    .rp-hint {
      font-size: 12px;
      color: #8c8c8c;
    }
    .rp-error {
      font-size: 12px;
      color: #cc2020;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RefundProofPickerComponent {
  readonly file = model<File | null>(null);
  readonly preview = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revoke());
    // The dialog clears the file when it opens again; drop the old preview with it.
    effect(() => {
      if (!this.file()) untracked(() => this.revoke());
    });
  }

  onFile(event: Event): void {
    const field = event.target as HTMLInputElement;
    const file = field.files?.[0] ?? null;
    field.value = '';
    if (!file) return;
    const problem = imageFileError(file);
    this.error.set(problem);
    if (problem) return;
    this.revoke();
    this.file.set(file);
    this.preview.set(URL.createObjectURL(file));
  }

  clear(): void {
    this.revoke();
    this.file.set(null);
    this.error.set(null);
  }

  private revoke(): void {
    const url = this.preview();
    if (url) URL.revokeObjectURL(url);
    this.preview.set(null);
  }
}

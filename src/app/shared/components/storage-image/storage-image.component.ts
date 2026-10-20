import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { NzImageModule } from 'ng-zorro-antd/image';
import { NzSpinModule } from 'ng-zorro-antd/spin';
import { PaymentReceiverService } from '../../../core/services/payment-receiver.service';

/**
 * An image kept in Firebase Storage (a receiver's QR code or a transfer screenshot), loaded through the signed-in
 * user's access (storage.rules). Click to open it full size.
 */
@Component({
  selector: 'app-storage-image',
  standalone: true,
  imports: [NzImageModule, NzSpinModule],
  template: `
    @if (url(); as src) {
      <img
        nz-image
        [nzSrc]="src"
        [alt]="alt()"
        [style.width.px]="size()"
        [style.height.px]="size()"
        class="si-img"
      />
    } @else if (failed()) {
      <span class="si-box" [style.width.px]="size()" [style.height.px]="size()"
        >Image unavailable</span
      >
    } @else {
      <span class="si-box" [style.width.px]="size()" [style.height.px]="size()"
        ><nz-spin nzSimple nzSize="small"
      /></span>
    }
  `,
  styles: `
    :host {
      display: inline-block;
      line-height: 0;
    }
    .si-img {
      object-fit: contain;
      border: 1px solid #E8E8E8;
      border-radius: 8px;
      background: #FFFFFF;
      cursor: zoom-in;
    }
    .si-box {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      text-align: center;
      border: 1px dashed #D9D9D9;
      border-radius: 8px;
      background: #F5F5F5;
      font-size: 12px;
      line-height: 1.3;
      color: #8C8C8C;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorageImageComponent {
  private readonly receivers = inject(PaymentReceiverService);

  readonly path = input.required<string>();
  readonly alt = input('');
  /** Width and height of the thumbnail in px. */
  readonly size = input(120);

  readonly url = signal<string | null>(null);
  readonly failed = signal(false);

  constructor() {
    effect((onCleanup) => {
      const path = this.path();
      let live = true;
      onCleanup(() => (live = false));
      this.url.set(null);
      this.failed.set(false);
      if (!path) {
        this.failed.set(true);
        return;
      }
      this.receivers.imageUrl(path).then(
        (url) => live && this.url.set(url),
        () => live && this.failed.set(true),
      );
    });
  }
}

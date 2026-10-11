import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NzIconModule } from 'ng-zorro-antd/icon';

/**
 * The dark Goldcomm brand panel beside the sign-in and sign-up forms. On narrow screens it shrinks to a header strip
 * with just the logo and wordmark.
 */
@Component({
  selector: 'app-auth-brand',
  standalone: true,
  imports: [NzIconModule],
  templateUrl: './auth-brand.component.html',
  styleUrl: './auth-brand.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthBrandComponent {
  protected readonly year = new Date().getFullYear();
  protected readonly features = [
    { icon: 'shop', text: 'Two-way radios and accessories' },
    { icon: 'tool', text: 'Repairs, programming and on-site installation' },
    { icon: 'message', text: 'Chat directly with our service team' },
  ];
}

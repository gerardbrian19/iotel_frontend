import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-settings-privacy',
  standalone: true,
  imports: [FormsModule, NzSwitchModule, NzDividerModule, NzSelectModule, NzIconModule],
  templateUrl: './privacy.component.html',
  styleUrl: './privacy.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyComponent {
  readonly profileVisibility = signal<'public' | 'private'>('public');
  readonly activityVisible = signal(true);
  readonly dataCollection = signal(true);
  readonly personalizedAds = signal(false);
}

import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMessageService } from 'ng-zorro-antd/message';
import { inject } from '@angular/core';

@Component({
  selector: 'app-settings-language',
  standalone: true,
  imports: [
    FormsModule,
    NzSelectModule,
    NzFormModule,
    NzButtonModule,
    NzDividerModule,
    NzIconModule,
  ],
  templateUrl: './language.component.html',
  styleUrl: './language.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageComponent {
  private readonly message = inject(NzMessageService);

  readonly selectedLanguage = signal('en');
  readonly selectedRegion = signal('ph');

  readonly languages = [
    { value: 'en', label: 'English' },
    { value: 'fil', label: 'Filipino' },
    { value: 'es', label: 'Español' },
    { value: 'zh', label: '中文 (Chinese)' },
    { value: 'ja', label: '日本語 (Japanese)' },
  ];

  readonly regions = [
    { value: 'ph', label: 'Philippines' },
    { value: 'us', label: 'United States' },
    { value: 'sg', label: 'Singapore' },
    { value: 'my', label: 'Malaysia' },
    { value: 'id', label: 'Indonesia' },
  ];

  save(): void {
    this.message.success('Language and region preferences saved.');
  }
}

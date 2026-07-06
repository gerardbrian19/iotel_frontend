import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzDividerModule } from 'ng-zorro-antd/divider';

interface HelpItem {
  icon: string;
  title: string;
  desc: string;
}

@Component({
  selector: 'app-settings-help',
  standalone: true,
  imports: [NzCardModule, NzIconModule, NzDividerModule],
  templateUrl: './help.component.html',
  styleUrl: './help.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpComponent {
  readonly helpItems: HelpItem[] = [
    { icon: 'question-circle', title: 'Frequently Asked Questions', desc: 'Browse common questions about orders, products, and accounts.' },
    { icon: 'message', title: 'Contact Support', desc: 'Chat with our support team for help with your orders and account.' },
    { icon: 'file-text', title: 'Terms of Service', desc: 'Read our terms and conditions for using IOTEL.' },
    { icon: 'lock', title: 'Privacy Policy', desc: 'Learn how we collect and protect your personal data.' },
    { icon: 'info-circle', title: 'About IOTEL', desc: 'Version info, acknowledgements, and company information.' },
  ];
}

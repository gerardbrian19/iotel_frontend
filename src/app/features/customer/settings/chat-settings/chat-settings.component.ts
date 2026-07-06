import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzDividerModule } from 'ng-zorro-antd/divider';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzButtonModule } from 'ng-zorro-antd/button';

@Component({
  selector: 'app-settings-chat',
  standalone: true,
  imports: [
    FormsModule,
    NzSwitchModule,
    NzInputModule,
    NzFormModule,
    NzDividerModule,
    NzIconModule,
    NzButtonModule,
  ],
  templateUrl: './chat-settings.component.html',
  styleUrl: './chat-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatSettingsComponent {
  readonly chatNotifications = signal(true);
  readonly readReceipts = signal(true);
  readonly autoReply = signal(false);
  readonly autoReplyMessage = signal('Hi! I\'m currently unavailable. I\'ll get back to you shortly.');
}

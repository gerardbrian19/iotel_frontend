import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AccountSecurityComponent } from '../account-security/account-security.component';
import { ProfileSettingsComponent } from '../profile-settings/profile-settings.component';

/**
 * The Account page of staff and admins (`/staff/account`, `/admin/account`): their profile (picture, name, phone, …,
 * the same form as the customer's Settings → Profile) above the password and authenticator settings.
 */
@Component({
  selector: 'app-staff-account',
  standalone: true,
  imports: [AccountSecurityComponent, ProfileSettingsComponent],
  template: `
    <div class="sa">
      <section class="sa-card"><app-profile-settings /></section>
      <section class="sa-card"><app-account-security /></section>
    </div>
  `,
  styles: `
    .sa {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 960px;
      margin: 0 auto;
      padding: 24px 16px;
    }
    .sa-card {
      background: #ffffff;
      border: 1px solid #f0f0f0;
      border-radius: 8px;
      overflow: hidden;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffAccountComponent {}

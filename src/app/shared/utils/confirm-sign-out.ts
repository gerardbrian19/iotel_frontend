import { inject } from '@angular/core';
import { NzModalService } from 'ng-zorro-antd/modal';
import { AuthService } from '../../core/services/auth.service';

/**
 * Returns a sign-out handler that asks for confirmation first. Call it in an injection context (a field initialiser);
 * the component must import `NzModalModule`, which provides `NzModalService`.
 */
export function injectConfirmSignOut(): () => void {
  const modal = inject(NzModalService);
  const auth = inject(AuthService);
  return () => {
    modal.confirm({
      nzTitle: 'Are you sure you want to sign out?',
      nzContent: 'You will need to sign in again to use your account.',
      nzIconType: 'logout',
      nzOkText: 'Sign Out',
      nzOkDanger: true,
      nzCancelText: 'Cancel',
      nzOnOk: () => auth.logout(),
    });
  };
}

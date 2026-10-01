import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzPopconfirmModule } from 'ng-zorro-antd/popconfirm';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../core/services/user.service';
import { authErrorMessage } from '../../../core/firebase/auth-errors';
import { USER_ROLES, User, UserRole } from '../../../core/models';
import {
  emailDomainTypo,
  emailFormat,
  personName,
  requiredTrimmed,
  strongPassword,
} from '../../../shared/utils/validators';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [
    DatePipe,
    TitleCasePipe,
    FormsModule,
    ReactiveFormsModule,
    NzTableModule,
    NzTagModule,
    NzButtonModule,
    NzInputModule,
    NzIconModule,
    NzSelectModule,
    NzModalModule,
    NzFormModule,
    NzAlertModule,
    NzPopconfirmModule,
  ],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsersComponent {
  private readonly userService = inject(UserService);
  private readonly auth = inject(AuthService);
  private readonly msg = inject(NzMessageService);
  private readonly fb = inject(FormBuilder);

  readonly roles = USER_ROLES;
  readonly users = this.userService.users;
  readonly loadError = this.userService.loadError;
  readonly currentUserId = () => this.auth.currentUser()?.id;

  readonly modalVisible = signal(false);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  /** Id of the account an action is running for. */
  readonly busyId = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [requiredTrimmed, personName]],
    email: ['', [requiredTrimmed, emailFormat, emailDomainTypo]],
    password: ['', [Validators.required, strongPassword]],
    role: ['staff' as UserRole, Validators.required],
  });

  constructor() {
    this.userService.watchUsers();
  }

  openCreate(): void {
    this.form.reset({ name: '', email: '', password: '', role: 'staff' });
    this.formError.set(null);
    this.modalVisible.set(true);
  }

  async create(): Promise<void> {
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsDirty();
      this.form.updateValueAndValidity();
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    try {
      await this.userService.createAccount(this.form.getRawValue());
      this.msg.success('Account created');
      this.modalVisible.set(false);
    } catch (err) {
      this.formError.set(authErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  async resetAuthenticator(user: User): Promise<void> {
    if (this.busyId()) return;
    this.busyId.set(user.id);
    try {
      await this.userService.resetAuthenticator(user.id);
      this.msg.success(`${user.name} will set up a new authenticator app at their next sign-in`);
    } catch (err) {
      this.msg.error(authErrorMessage(err));
    } finally {
      this.busyId.set(null);
    }
  }

  async sendPasswordReset(user: User): Promise<void> {
    if (this.busyId()) return;
    this.busyId.set(user.id);
    try {
      await this.auth.sendPasswordReset(user.email);
      this.msg.success(`Password reset email sent to ${user.email}`);
    } catch (err) {
      this.msg.error(authErrorMessage(err));
    } finally {
      this.busyId.set(null);
    }
  }

  async changeRole(user: User, role: UserRole): Promise<void> {
    if (role === user.role) return;
    try {
      await this.userService.updateRole(user.id, role);
      this.msg.success(`${user.name} is now ${role}`);
    } catch (err) {
      this.msg.error(authErrorMessage(err));
    }
  }
}

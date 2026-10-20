import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { ACTIVITY_CATEGORIES, ActivityActorRole, ActivityCategory } from '../../../core/models';
import { ActivityService } from '../../../core/services/activity.service';
import {
  ACTIVITY_RANGES,
  ACTOR_ROLES,
  ActivityRange,
  activityCategoryView,
  activityCsv,
  actorRoleView,
  filterActivity,
} from './activity-view';

/** Admin: the activity log (who did what and when), with filters and CSV export. */
@Component({
  selector: 'app-admin-activity',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzIconModule,
    NzInputModule,
    NzSelectModule,
    NzTableModule,
    NzTagModule,
  ],
  templateUrl: './activity.component.html',
  styleUrl: './activity.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminActivityComponent {
  private readonly activity = inject(ActivityService);

  readonly categories = ACTIVITY_CATEGORIES;
  readonly roles = ACTOR_ROLES;
  readonly ranges = ACTIVITY_RANGES;
  readonly categoryView = activityCategoryView;
  readonly roleView = actorRoleView;

  readonly category = signal<ActivityCategory | null>(null);
  readonly role = signal<ActivityActorRole | null>(null);
  readonly range = signal<ActivityRange>('all');
  readonly search = signal('');

  readonly loading = this.activity.loading;
  readonly error = this.activity.error;
  readonly hasMore = this.activity.hasMore;
  readonly loadedCount = computed(() => this.activity.entries().length);

  readonly filtered = computed(() =>
    filterActivity(this.activity.entries(), {
      category: this.category(),
      role: this.role(),
      range: this.range(),
      search: this.search(),
    }),
  );

  loadMore(): void {
    this.activity.loadMore();
  }

  clearFilters(): void {
    this.category.set(null);
    this.role.set(null);
    this.range.set('all');
    this.search.set('');
  }

  /** Downloads the entries that match the filters. */
  exportCsv(): void {
    const blob = new Blob([activityCsv(this.filtered())], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `iotel-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
}

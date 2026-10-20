import {
  ACTIVITY_CATEGORIES,
  ActivityActorRole,
  ActivityCategory,
  ActivityEntry,
} from '../../../core/models';

const CATEGORY_COLORS: Record<ActivityCategory, string> = {
  order: 'blue',
  payment: 'gold',
  booking: 'purple',
  inventory: 'cyan',
  product: 'geekblue',
  service: 'magenta',
  account: 'default',
};

/** Tag label and colour of an activity category. */
export function activityCategoryView(category: ActivityCategory): { label: string; color: string } {
  return {
    label: ACTIVITY_CATEGORIES.find((c) => c.value === category)?.label ?? category,
    color: CATEGORY_COLORS[category] ?? 'default',
  };
}

export const ACTOR_ROLES: readonly { value: ActivityActorRole; label: string; color: string }[] = [
  { value: 'admin', label: 'Admin', color: 'red' },
  { value: 'staff', label: 'Staff', color: 'orange' },
  { value: 'customer', label: 'Customer', color: 'green' },
  { value: 'system', label: 'System', color: 'default' },
];

export function actorRoleView(role: ActivityActorRole): { label: string; color: string } {
  return ACTOR_ROLES.find((r) => r.value === role) ?? { label: role, color: 'default' };
}

export type ActivityRange = 'today' | '7d' | '30d' | 'all';

export const ACTIVITY_RANGES: readonly { value: ActivityRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All loaded' },
];

export interface ActivityFilter {
  category: ActivityCategory | null;
  role: ActivityActorRole | null;
  range: ActivityRange;
  search: string;
}

function rangeStart(range: ActivityRange, now: Date): string | null {
  if (range === 'all') return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === '7d') start.setDate(start.getDate() - 6);
  if (range === '30d') start.setDate(start.getDate() - 29);
  return start.toISOString();
}

export function filterActivity(
  entries: readonly ActivityEntry[],
  filter: ActivityFilter,
  now = new Date(),
): ActivityEntry[] {
  const from = rangeStart(filter.range, now);
  const words = filter.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((e) => {
    if (filter.category && e.category !== filter.category) return false;
    if (filter.role && e.actorRole !== filter.role) return false;
    if (from && e.at < from) return false;
    if (!words.length) return true;
    const text = `${e.actorName} ${e.summary} ${e.targetLabel}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

function csvCell(value: string | number | undefined): string {
  const text = value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The entries as a CSV file (UTF-8 with BOM so Excel shows ₱ correctly). */
export function activityCsv(entries: readonly ActivityEntry[]): string {
  const header = ['Time', 'Who', 'Role', 'Category', 'Activity', 'Target', 'Amount (PHP)'];
  const rows = entries.map((e) =>
    [
      e.at,
      e.actorName,
      actorRoleView(e.actorRole).label,
      activityCategoryView(e.category).label,
      e.summary,
      e.targetLabel,
      e.amount,
    ]
      .map(csvCell)
      .join(','),
  );
  return '﻿' + [header.join(','), ...rows].join('\r\n');
}

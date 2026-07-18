'use client';

import { Badge } from '@/components/ui/Badge';
import { SubjectStatusChanger } from '@/components/subjects/SubjectStatusChanger';
import { SubjectBaselineCompleter } from '@/components/subjects/SubjectBaselineCompleter';
import { SubjectRandomizer } from '@/components/subjects/SubjectRandomizer';
import { usePermissions } from '@/hooks/usePermissions';
import { getVisitLockStatus } from '@/lib/utils/visitSequencing';
import type { Subject, SubjectStatus, Visit } from '@/types/subjects';
import type { VisitTemplateItem } from '@/types/studies';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'default' | 'primary' | 'info';

const STATUS_VARIANT: Record<SubjectStatus, BadgeVariant> = {
  pre_screening: 'default',
  screening: 'info',
  screen_failed: 'danger',
  randomized: 'primary',
  active: 'success',
  completed: 'success',
  early_terminated: 'danger',
  lost_to_follow_up: 'warning',
};

export function SubjectProfileHeader({
  subject,
  studyName,
  siteName,
  nextVisit,
  visits,
  templateItems,
  onChanged,
}: {
  subject: Subject;
  studyName: string;
  siteName: string;
  nextVisit: Visit | null;
  visits: Visit[];
  templateItems: VisitTemplateItem[];
  onChanged: () => void;
}) {
  const { hasPermission } = usePermissions();

  const baselineItem = templateItems.find((i) => i.is_baseline);
  const baselineVisit = baselineItem
    ? visits.find((v) => v.visit_template_item_id === baselineItem.id)
    : undefined;
  const baselineLockStatus = baselineVisit
    ? getVisitLockStatus(baselineVisit, visits, templateItems)
    : { locked: false as const };

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900">{subject.subject_number}</h1>
            {subject.initials && <span className="text-gray-400">({subject.initials})</span>}
            <Badge variant={STATUS_VARIANT[subject.status]}>
              {subject.status.replace(/_/g, ' ')}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {studyName} · {siteName}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Next visit:{' '}
            {nextVisit
              ? `${nextVisit.visit_name} — ${nextVisit.target_date ?? 'unscheduled'}`
              : '—'}
          </p>
        </div>

        {hasPermission('edit_subject') && (
          <div className="flex items-center gap-2">
            <SubjectBaselineCompleter
              subject={subject}
              baselineVisit={baselineVisit}
              lockStatus={baselineLockStatus}
              onChanged={onChanged}
            />
            <SubjectRandomizer subject={subject} onChanged={onChanged} />
            <SubjectStatusChanger subject={subject} onChanged={onChanged} />
          </div>
        )}
      </div>
    </div>
  );
}

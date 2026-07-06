'use client';

import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Visit, VisitStatus } from '@/types/subjects';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'default' | 'primary' | 'info';

const STATUS_VARIANT: Record<VisitStatus, BadgeVariant> = {
  scheduled: 'default',
  confirmed: 'info',
  in_progress: 'primary',
  completed: 'success',
  missed: 'danger',
  rescheduled: 'warning',
  cancelled: 'default',
  out_of_window: 'warning',
};

export function SubjectVisitsList({ visits }: { visits: Visit[] }) {
  if (visits.length === 0) {
    return (
      <EmptyState
        title="No visits scheduled"
        description="The Baseline visit is scheduled once the subject is created; completing it generates the rest of the protocol schedule"
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Visit</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Target Date</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Window</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {visits.map((visit) => (
            <tr key={visit.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{visit.visit_name}</td>
              <td className="px-4 py-3 text-gray-600">{visit.visit_type}</td>
              <td className="px-4 py-3 text-gray-600">{visit.target_date ?? '—'}</td>
              <td className="px-4 py-3 text-gray-600">
                {visit.window_start && visit.window_end
                  ? `${visit.window_start} – ${visit.window_end}`
                  : '—'}
              </td>
              <td className="px-4 py-3">
                <Badge variant={STATUS_VARIANT[visit.status]}>
                  {visit.status.replace(/_/g, ' ')}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

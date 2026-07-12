'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { getVisitLockStatus } from '@/lib/utils/visitSequencing';
import { VisitConfirmer } from '@/components/subjects/VisitConfirmer';
import { VisitStarter } from '@/components/subjects/VisitStarter';
import { VisitCompleter } from '@/components/subjects/VisitCompleter';
import { VisitRescheduler } from '@/components/subjects/VisitRescheduler';
import { VisitCanceller } from '@/components/subjects/VisitCanceller';
import { VisitReopener } from '@/components/subjects/VisitReopener';
import type { CalendarEvent } from '@/types/calendar';
import type { Visit } from '@/types/subjects';
import type { VisitTemplateItem, VisitTemplateWithItems } from '@/types/studies';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'default' | 'primary' | 'info';

const STATUS_VARIANT: Record<Visit['status'], BadgeVariant> = {
  scheduled: 'default',
  confirmed: 'info',
  in_progress: 'primary',
  completed: 'success',
  missed: 'danger',
  rescheduled: 'warning',
  cancelled: 'default',
  out_of_window: 'warning',
};

export function VisitDetailPanel({
  event,
  onClose,
  onChanged,
}: {
  event: CalendarEvent | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [visit, setVisit] = useState<Visit | null>(null);
  const [allVisits, setAllVisits] = useState<Visit[]>([]);
  const [templateItems, setTemplateItems] = useState<VisitTemplateItem[]>([]);
  const [subjectNumber, setSubjectNumber] = useState('—');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!event?.related_record_id) return;
    setLoading(true);
    try {
      const visitRes = await fetch(`/api/visits/${event.related_record_id}`);
      if (!visitRes.ok) {
        setVisit(null);
        return;
      }
      const visitJson = (await visitRes.json()) as { data: Visit };
      const loadedVisit = visitJson.data;
      setVisit(loadedVisit);

      const [subjectRes, visitsRes, templatesRes] = await Promise.all([
        fetch(`/api/subjects/${loadedVisit.subject_id}`),
        fetch(`/api/subjects/${loadedVisit.subject_id}/visits`),
        fetch(`/api/studies/${loadedVisit.study_id}/visit-templates`),
      ]);
      if (subjectRes.ok) {
        const subjectJson = (await subjectRes.json()) as { data: { subject_number: string } };
        setSubjectNumber(subjectJson.data.subject_number);
      }
      if (visitsRes.ok) {
        const visitsJson = (await visitsRes.json()) as { data: Visit[] };
        setAllVisits(visitsJson.data);
      }
      if (templatesRes.ok) {
        const templatesJson = (await templatesRes.json()) as { data: VisitTemplateWithItems[] };
        const approved = templatesJson.data.find((t) => t.status === 'approved');
        setTemplateItems(approved?.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [event]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleActionChanged() {
    void load();
    onChanged();
  }

  const lockStatus = visit
    ? getVisitLockStatus(visit, allVisits, templateItems)
    : { locked: false as const };

  return (
    <Modal open={event !== null} onClose={onClose} title={event?.title ?? 'Visit'}>
      {loading || !visit ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-gray-500">Status</dt>
              <dd className="mt-0.5">
                <Badge variant={STATUS_VARIANT[visit.status]}>
                  {visit.status.replace(/_/g, ' ')}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Related Subject</dt>
              <dd className="mt-0.5">
                <Link
                  href={`/subjects/${visit.subject_id}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {subjectNumber}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Target Date</dt>
              <dd className="mt-0.5 text-gray-900">{visit.target_date ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Window</dt>
              <dd className="mt-0.5 text-gray-900">
                {visit.window_start && visit.window_end
                  ? `${visit.window_start} – ${visit.window_end}`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Actual Date</dt>
              <dd className="mt-0.5 text-gray-900">{visit.scheduled_date ?? '—'}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
            <VisitConfirmer
              subjectId={visit.subject_id}
              visit={visit}
              onChanged={handleActionChanged}
            />
            <VisitStarter
              subjectId={visit.subject_id}
              visit={visit}
              onChanged={handleActionChanged}
            />
            <VisitCompleter
              subjectId={visit.subject_id}
              visit={visit}
              lockStatus={lockStatus}
              onChanged={handleActionChanged}
            />
            <VisitRescheduler
              subjectId={visit.subject_id}
              visit={visit}
              onChanged={handleActionChanged}
            />
            <VisitCanceller
              subjectId={visit.subject_id}
              visit={visit}
              onChanged={handleActionChanged}
            />
            <VisitReopener
              subjectId={visit.subject_id}
              visit={visit}
              onChanged={handleActionChanged}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

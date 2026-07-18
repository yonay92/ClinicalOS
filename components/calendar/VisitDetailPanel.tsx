'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { usePermissions } from '@/hooks/usePermissions';
import { getVisitLockStatus } from '@/lib/utils/visitSequencing';
import { VisitConfirmer } from '@/components/subjects/VisitConfirmer';
import { VisitStarter } from '@/components/subjects/VisitStarter';
import { VisitCompleter } from '@/components/subjects/VisitCompleter';
import { VisitRescheduler } from '@/components/subjects/VisitRescheduler';
import { VisitCanceller } from '@/components/subjects/VisitCanceller';
import { VisitReopener } from '@/components/subjects/VisitReopener';
import { ContactInformationSection } from '@/components/subjects/ContactInformationSection';
import type { CalendarEvent } from '@/types/calendar';
import type { Visit } from '@/types/subjects';
import type { VisitNote } from '@/types/visits';
import type { VisitTemplateItem, VisitTemplateWithItems, Study } from '@/types/studies';

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

// Every action self-gates on visit.status (VisitReopener additionally on
// reopen_visit permission) — this is only that same visibility union restated
// so the panel can show a fallback when nothing applies. It does not
// reimplement any action's API call, modal, or validation.
const STATUSES_WITH_AN_ACTION: Visit['status'][] = ['scheduled', 'confirmed', 'in_progress'];

export function VisitDetailPanel({
  event,
  siteName,
  onClose,
  onChanged,
}: {
  event: CalendarEvent | null;
  siteName: string | undefined;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { hasPermission } = usePermissions();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [allVisits, setAllVisits] = useState<Visit[]>([]);
  const [templateItems, setTemplateItems] = useState<VisitTemplateItem[]>([]);
  const [subjectNumber, setSubjectNumber] = useState('—');
  const [studyName, setStudyName] = useState('—');
  const [notes, setNotes] = useState<VisitNote[]>([]);
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

      const [subjectRes, visitsRes, templatesRes, studyRes, notesRes] = await Promise.all([
        fetch(`/api/subjects/${loadedVisit.subject_id}`),
        fetch(`/api/subjects/${loadedVisit.subject_id}/visits`),
        fetch(`/api/studies/${loadedVisit.study_id}/visit-templates`),
        fetch(`/api/studies/${loadedVisit.study_id}`),
        fetch(`/api/subjects/${loadedVisit.subject_id}/visits/${loadedVisit.id}/notes`),
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
      if (studyRes.ok) {
        const studyJson = (await studyRes.json()) as { data: Study };
        setStudyName(studyJson.data.study_name);
      }
      if (notesRes.ok) {
        const notesJson = (await notesRes.json()) as { data: VisitNote[] };
        setNotes(notesJson.data);
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

  const hasAnyAction = visit
    ? STATUSES_WITH_AN_ACTION.includes(visit.status) ||
      (visit.status === 'completed' && hasPermission('reopen_visit'))
    : false;

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
              <dt className="text-gray-500">Visit Name</dt>
              <dd className="mt-0.5 text-gray-900">{visit.visit_name}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Study</dt>
              <dd className="mt-0.5 text-gray-900">{studyName}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Site</dt>
              <dd className="mt-0.5 text-gray-900">{siteName ?? '—'}</dd>
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

          <ContactInformationSection subjectId={visit.subject_id} visitId={visit.id} />

          {notes.length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <h4 className="mb-2 text-sm font-semibold text-gray-900">Notes</h4>
              <ul className="space-y-2">
                {notes.map((note) => (
                  <li key={note.id} className="text-sm text-gray-700">
                    <p>{note.note}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(note.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
            {hasAnyAction ? (
              <>
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
              </>
            ) : (
              <p className="text-sm text-gray-500">No actions available for this visit.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

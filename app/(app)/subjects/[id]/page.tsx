'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SubjectProfileHeader } from '@/components/subjects/SubjectProfileHeader';
import { SubjectVisitsList } from '@/components/subjects/SubjectVisitsList';
import { SubjectTimeline } from '@/components/subjects/SubjectTimeline';
import { SubjectNotes } from '@/components/subjects/SubjectNotes';
import { SubjectDocuments } from '@/components/subjects/SubjectDocuments';
import type { Subject, Visit, SubjectStatusHistory } from '@/types/subjects';

const TABS = ['Overview', 'Visits', 'Timeline', 'Notes', 'Documents', 'History'] as const;
type Tab = (typeof TABS)[number];

export default function SubjectProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: subjectId } = use(params);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [studyName, setStudyName] = useState('—');
  const [siteName, setSiteName] = useState('—');
  const [visits, setVisits] = useState<Visit[]>([]);
  const [history, setHistory] = useState<SubjectStatusHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('Overview');

  const fetchSubject = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/subjects/${subjectId}`);
      if (!res.ok) {
        setSubject(null);
        return;
      }
      const json = (await res.json()) as { data: Subject };
      const subjectData = json.data;
      setSubject(subjectData);

      const [studyRes, sitesRes, visitsRes] = await Promise.all([
        fetch(`/api/studies/${subjectData.study_id}`),
        fetch('/api/sites'),
        fetch(`/api/subjects/${subjectId}/visits`),
      ]);
      if (studyRes.ok) {
        const studyJson = (await studyRes.json()) as { data: { study_name: string } };
        setStudyName(studyJson.data.study_name);
      }
      if (sitesRes.ok) {
        const sitesJson = (await sitesRes.json()) as { data: Array<{ id: string; name: string }> };
        const site = sitesJson.data.find((s) => s.id === subjectData.site_id);
        if (site) setSiteName(site.name);
      }
      if (visitsRes.ok) {
        const visitsJson = (await visitsRes.json()) as { data: Visit[] };
        setVisits(visitsJson.data);
      }
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    void fetchSubject();
  }, [fetchSubject]);

  useEffect(() => {
    if (tab !== 'History') return;
    void (async () => {
      const res = await fetch(`/api/subjects/${subjectId}/history`);
      if (res.ok) {
        const json = (await res.json()) as { data: SubjectStatusHistory[] };
        setHistory(json.data);
      }
    })();
  }, [tab, subjectId]);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!subject) {
    return <EmptyState title="Subject not found" description="It may have been removed" />;
  }

  const nextVisit =
    visits
      .filter((v) => v.status === 'scheduled' || v.status === 'confirmed')
      .sort((a, b) => (a.target_date ?? '').localeCompare(b.target_date ?? ''))[0] ?? null;

  return (
    <div>
      <SubjectProfileHeader
        subject={subject}
        studyName={studyName}
        siteName={siteName}
        nextVisit={nextVisit}
        onChanged={() => void fetchSubject()}
      />

      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Subject Details</h3>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Screening date</dt>
                <dd className="text-gray-900">{subject.screening_date ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Baseline date</dt>
                <dd className="text-gray-900">{subject.baseline_date ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Randomization number</dt>
                <dd className="text-gray-900">{subject.randomization_number ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Randomization date</dt>
                <dd className="text-gray-900">{subject.randomization_date ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">End of study date</dt>
                <dd className="text-gray-900">{subject.end_of_study_date ?? '—'}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Visit Schedule</h3>
            <p className="text-sm text-gray-500">
              {subject.baseline_date
                ? `${visits.length} visit(s) generated from the approved visit template.`
                : 'Baseline visit scheduled — complete it to generate the rest of the protocol schedule.'}
            </p>
          </div>
        </div>
      )}

      {tab === 'Visits' && <SubjectVisitsList visits={visits} />}
      {tab === 'Timeline' && <SubjectTimeline subjectId={subject.id} />}
      {tab === 'Notes' && <SubjectNotes subjectId={subject.id} />}
      {tab === 'Documents' && <SubjectDocuments subjectId={subject.id} />}

      {tab === 'History' && (
        <div className="space-y-2">
          {history.length === 0 ? (
            <EmptyState title="No status changes yet" description="Status changes appear here" />
          ) : (
            history.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-sm text-gray-900">
                  {entry.old_status ? entry.old_status.replace(/_/g, ' ') : 'created'} →{' '}
                  {entry.new_status.replace(/_/g, ' ')}
                </p>
                {entry.reason && <p className="text-sm text-gray-600">{entry.reason}</p>}
                <p className="text-xs text-gray-400">
                  {new Date(entry.changed_at).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

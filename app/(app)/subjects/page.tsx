'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Subject, SubjectStatus } from '@/types/subjects';
import type { Study, CrcOption } from '@/types/studies';
import type { Site } from '@/types/sites';

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

const STATUS_OPTIONS: Array<{ value: SubjectStatus; label: string }> = [
  { value: 'pre_screening', label: 'Pre-Screening' },
  { value: 'screening', label: 'Screening' },
  { value: 'screen_failed', label: 'Screen Failed' },
  { value: 'randomized', label: 'Randomized' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'early_terminated', label: 'Early Terminated' },
  { value: 'lost_to_follow_up', label: 'Lost to Follow Up' },
];

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [studies, setStudies] = useState<Study[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [crcOptions, setCrcOptions] = useState<CrcOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [studyFilter, setStudyFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [assignedCrcFilter, setAssignedCrcFilter] = useState('');

  useEffect(() => {
    void (async () => {
      const [studiesRes, sitesRes, crcRes] = await Promise.all([
        fetch('/api/studies'),
        fetch('/api/sites'),
        fetch('/api/studies/crc-options'),
      ]);
      if (studiesRes.ok) setStudies(((await studiesRes.json()) as { data: Study[] }).data);
      if (sitesRes.ok) setSites(((await sitesRes.json()) as { data: Site[] }).data);
      if (crcRes.ok) setCrcOptions(((await crcRes.json()) as { data: CrcOption[] }).data);
    })();
  }, []);

  const fetchSubjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (studyFilter) params.set('study_id', studyFilter);
      if (siteFilter) params.set('site_id', siteFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (searchFilter) params.set('search', searchFilter);
      if (assignedCrcFilter) params.set('assigned_crc', assignedCrcFilter);

      const res = await fetch(`/api/subjects?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load subjects');
      const json = (await res.json()) as { data: Subject[] };
      setSubjects(json.data);
    } catch {
      setError('Failed to load subjects. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [studyFilter, siteFilter, statusFilter, searchFilter, assignedCrcFilter]);

  useEffect(() => {
    void fetchSubjects();
  }, [fetchSubjects]);

  const studyName = (studyId: string) => studies.find((s) => s.id === studyId)?.study_name ?? '—';
  const siteName = (siteId: string) => sites.find((s) => s.id === siteId)?.name ?? '—';

  return (
    <div>
      <PageHeader
        title="Subjects"
        description="Manage subject enrollment, lifecycle status, and clinical timeline"
        action={
          <Link href="/subjects/new">
            <Button>New Subject</Button>
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-5 gap-3">
        <Input
          placeholder="Search subject # or initials"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
        />
        <Select
          value={studyFilter}
          onChange={(e) => setStudyFilter(e.target.value)}
          placeholder="All studies"
          options={studies.map((s) => ({ value: s.id, label: s.study_name }))}
        />
        <Select
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
          placeholder="All sites"
          options={sites.map((s) => ({ value: s.id, label: s.name }))}
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          placeholder="All statuses"
          options={STATUS_OPTIONS}
        />
        <Select
          value={assignedCrcFilter}
          onChange={(e) => setAssignedCrcFilter(e.target.value)}
          placeholder="Assigned CRC"
          options={crcOptions.map((c) => ({ value: c.user_id, label: c.full_name }))}
        />
      </div>

      {error && (
        <div className="mb-4">
          <AlertBanner variant="error" message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : subjects.length === 0 ? (
        <EmptyState
          title="No subjects yet"
          description="Enroll your first subject once the study has an approved visit template"
          action={
            <Link href="/subjects/new">
              <Button>New Subject</Button>
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Subject</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Study</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Site</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {subjects.map((subject) => (
                <tr key={subject.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/subjects/${subject.id}`} className="hover:underline">
                      {subject.subject_number}
                    </Link>
                    {subject.initials && (
                      <span className="ml-2 text-gray-400">({subject.initials})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{studyName(subject.study_id)}</td>
                  <td className="px-4 py-3 text-gray-600">{siteName(subject.site_id)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[subject.status]}>
                      {subject.status.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/subjects/${subject.id}`}>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

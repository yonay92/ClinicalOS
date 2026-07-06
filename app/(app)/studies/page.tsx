'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Study, StudyStatus } from '@/types/studies';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'default' | 'primary' | 'info';

const STATUS_VARIANT: Record<StudyStatus, BadgeVariant> = {
  draft: 'default',
  active: 'success',
  on_hold: 'warning',
  closed: 'danger',
  archived: 'default',
};

type ViewFilter = 'active' | 'archived' | 'all';

export default function StudiesPage() {
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewFilter, setViewFilter] = useState<ViewFilter>('active');

  const fetchStudies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ view: viewFilter });
      const res = await fetch(`/api/studies?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load studies');
      const json = (await res.json()) as { data: Study[] };
      setStudies(json.data);
    } catch {
      setError('Failed to load studies. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [viewFilter]);

  useEffect(() => {
    void fetchStudies();
  }, [fetchStudies]);

  return (
    <div>
      <PageHeader
        title="Studies"
        description="Manage clinical trial studies from creation through activation"
        action={
          <div className="flex gap-2">
            <Link href="/studies/new">
              <Button variant="outline">New Study</Button>
            </Link>
            <Link href="/studies/upload-protocol">
              <Button>Upload Protocol</Button>
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex gap-3">
        <div className="w-48">
          <Select
            value={viewFilter}
            onChange={(e) => setViewFilter(e.target.value as ViewFilter)}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'archived', label: 'Archived' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
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
      ) : studies.length === 0 ? (
        <EmptyState
          title="No studies yet"
          description="Create your first study manually or upload a protocol to get started"
          action={
            <Link href="/studies/new">
              <Button>New Study</Button>
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Study</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Sponsor</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Phase</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {studies.map((study) => (
                <tr key={study.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/studies/${study.id}`} className="hover:underline">
                      {study.study_name}
                    </Link>
                    {study.ai_generated && (
                      <Badge variant="info" className="ml-2">
                        AI Draft
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{study.sponsor ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{study.phase ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[study.status]}>{study.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/studies/${study.id}`}>
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

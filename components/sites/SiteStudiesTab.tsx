'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { SiteAssignedStudy } from '@/types/sites';
import type { Study } from '@/types/studies';

export function SiteStudiesTab({ siteId }: { siteId: string }) {
  const [assigned, setAssigned] = useState<SiteAssignedStudy[]>([]);
  const [allStudies, setAllStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudyId, setSelectedStudyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAssigned = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/studies`);
      if (res.ok) {
        const json = (await res.json()) as { data: SiteAssignedStudy[] };
        setAssigned(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  const fetchAllStudies = useCallback(async () => {
    const res = await fetch('/api/studies?view=all');
    if (res.ok) {
      const json = (await res.json()) as { data: Study[] };
      setAllStudies(json.data);
    }
  }, []);

  useEffect(() => {
    void fetchAssigned();
    void fetchAllStudies();
  }, [fetchAssigned, fetchAllStudies]);

  async function handleAssign() {
    if (!selectedStudyId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/studies/${selectedStudyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_ids: [siteId] }),
      });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? 'Failed to assign study');
        return;
      }
      setSelectedStudyId('');
      void fetchAssigned();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(studyId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/studies/${studyId}/sites/${siteId}`, { method: 'DELETE' });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? 'Failed to remove study');
        return;
      }
      void fetchAssigned();
    } finally {
      setBusy(false);
    }
  }

  const assignedIds = new Set(assigned.map((a) => a.study_id));
  const availableStudies = allStudies.filter((s) => !assignedIds.has(s.id));

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex-1">
          <Select
            label="Assign a study"
            value={selectedStudyId}
            onChange={(e) => setSelectedStudyId(e.target.value)}
            placeholder="Select a study"
            options={availableStudies.map((s) => ({ value: s.id, label: s.study_name }))}
          />
        </div>
        <Button
          loading={busy}
          disabled={busy || !selectedStudyId}
          onClick={() => void handleAssign()}
        >
          Assign
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {assigned.length === 0 ? (
        <EmptyState
          title="No studies assigned"
          description="Assign a study to this site using the picker above"
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Study</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Protocol Number</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assigned.map((study) => (
                <tr key={study.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{study.study_name}</td>
                  <td className="px-4 py-3 text-gray-600">{study.protocol_number ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{study.status}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleRemove(study.study_id)}
                    >
                      Remove
                    </Button>
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

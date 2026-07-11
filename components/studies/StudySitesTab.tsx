'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { StudyAssignedSite } from '@/types/studies';
import type { Site } from '@/types/sites';

export function StudySitesTab({ studyId }: { studyId: string }) {
  const [assigned, setAssigned] = useState<StudyAssignedSite[]>([]);
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAssigned = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/studies/${studyId}/sites`);
      if (res.ok) {
        const json = (await res.json()) as { data: StudyAssignedSite[] };
        setAssigned(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [studyId]);

  const fetchAllSites = useCallback(async () => {
    const res = await fetch('/api/sites?view=all');
    if (res.ok) {
      const json = (await res.json()) as { data: Site[] };
      setAllSites(json.data);
    }
  }, []);

  useEffect(() => {
    void fetchAssigned();
    void fetchAllSites();
  }, [fetchAssigned, fetchAllSites]);

  async function handleAssign() {
    if (!selectedSiteId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/studies/${studyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_ids: [selectedSiteId] }),
      });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? 'Failed to assign site');
        return;
      }
      setSelectedSiteId('');
      void fetchAssigned();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(siteId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/studies/${studyId}/sites/${siteId}`, { method: 'DELETE' });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? 'Failed to remove site');
        return;
      }
      void fetchAssigned();
    } finally {
      setBusy(false);
    }
  }

  const assignedIds = new Set(assigned.map((a) => a.site_id));
  const availableSites = allSites.filter((s) => !assignedIds.has(s.id));

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
            label="Assign a site"
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            placeholder="Select a site"
            options={availableSites.map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>
        <Button
          loading={busy}
          disabled={busy || !selectedSiteId}
          onClick={() => void handleAssign()}
        >
          Assign
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {assigned.length === 0 ? (
        <EmptyState
          title="No sites assigned"
          description="Assign a site to this study using the picker above"
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Site</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Site Number</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assigned.map((site) => (
                <tr key={site.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{site.name}</td>
                  <td className="px-4 py-3 text-gray-600">{site.site_code ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{site.status}</td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleRemove(site.site_id)}
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

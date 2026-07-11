'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { SiteProfileHeader } from '@/components/sites/SiteProfileHeader';
import { SiteStudiesTab } from '@/components/sites/SiteStudiesTab';
import { SiteStaffTab } from '@/components/sites/SiteStaffTab';
import type { Site } from '@/types/sites';

const TABS = ['Overview', 'Studies', 'Staff'] as const;
type Tab = (typeof TABS)[number];

export default function SiteProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: siteId } = use(params);
  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('Overview');

  const fetchSite = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${siteId}`);
      if (!res.ok) {
        setSite(null);
        return;
      }
      const json = (await res.json()) as { data: Site };
      setSite(json.data);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void fetchSite();
  }, [fetchSite]);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!site) {
    return <EmptyState title="Site not found" description="It may have been removed" />;
  }

  return (
    <div>
      <SiteProfileHeader site={site} onChanged={() => void fetchSite()} />

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
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-900">Site Details</h3>
          <dl className="max-w-lg space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Site number</dt>
              <dd className="text-gray-900">{site.site_code ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Principal Investigator</dt>
              <dd className="text-gray-900">{site.principal_investigator ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Address</dt>
              <dd className="text-gray-900">{site.address ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">City / State / ZIP</dt>
              <dd className="text-gray-900">
                {[site.city, site.state, site.zip_code].filter(Boolean).join(', ') || '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Phone</dt>
              <dd className="text-gray-900">{site.phone ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Timezone</dt>
              <dd className="text-gray-900">{site.timezone ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Status</dt>
              <dd className="text-gray-900">{site.status}</dd>
            </div>
          </dl>
        </div>
      )}

      {tab === 'Studies' && <SiteStudiesTab siteId={site.id} />}
      {tab === 'Staff' && <SiteStaffTab siteId={site.id} />}
    </div>
  );
}

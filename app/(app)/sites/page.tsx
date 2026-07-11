'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Site, SiteStatus } from '@/types/sites';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'default' | 'primary' | 'info';

const STATUS_VARIANT: Record<SiteStatus, BadgeVariant> = {
  active: 'success',
  inactive: 'default',
  closed: 'danger',
  archived: 'default',
};

type ViewFilter = 'active' | 'archived' | 'all';

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('active');

  const fetchSites = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ view: viewFilter });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/sites?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load sites');
      const json = (await res.json()) as { data: Site[] };
      setSites(json.data);
    } catch {
      setError('Failed to load sites. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [search, viewFilter]);

  useEffect(() => {
    void fetchSites();
  }, [fetchSites]);

  return (
    <div>
      <PageHeader
        title="Sites"
        description="Manage clinical research sites, staff, and study assignments"
        action={
          <Link href="/sites/new">
            <Button>New Site</Button>
          </Link>
        }
      />

      <div className="mb-4 flex gap-3">
        <div className="w-64">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, site number, or city"
          />
        </div>
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
      ) : sites.length === 0 ? (
        <EmptyState
          title="No sites yet"
          description="Add your first clinical research site"
          action={
            <Link href="/sites/new">
              <Button>New Site</Button>
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Site Number</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">PI</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">City</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sites.map((site) => (
                <tr key={site.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/sites/${site.id}`} className="hover:underline">
                      {site.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{site.site_code ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{site.principal_investigator ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {[site.city, site.state].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[site.status] ?? 'default'}>{site.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/sites/${site.id}`}>
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

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
import type { Lead, LeadStatus, ReferralSource } from '@/types/recruitment';
import type { Study } from '@/types/studies';
import type { Site } from '@/types/sites';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'default' | 'primary' | 'info';

const STATUS_VARIANT: Record<LeadStatus, BadgeVariant> = {
  new: 'default',
  contacted: 'info',
  prescreening: 'primary',
  waitlisted: 'warning',
  converted: 'success',
  declined: 'danger',
  lost: 'danger',
};

const STATUS_OPTIONS: Array<{ value: LeadStatus; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'prescreening', label: 'Prescreening' },
  { value: 'waitlisted', label: 'Waitlisted' },
  { value: 'converted', label: 'Converted' },
  { value: 'declined', label: 'Declined' },
  { value: 'lost', label: 'Lost' },
];

export default function RecruitmentPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [studies, setStudies] = useState<Study[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [referralSources, setReferralSources] = useState<ReferralSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [studyFilter, setStudyFilter] = useState('');

  useEffect(() => {
    void (async () => {
      const [studiesRes, sitesRes, sourcesRes] = await Promise.all([
        fetch('/api/studies'),
        fetch('/api/sites'),
        fetch('/api/referral-sources'),
      ]);
      if (studiesRes.ok) setStudies(((await studiesRes.json()) as { data: Study[] }).data);
      if (sitesRes.ok) setSites(((await sitesRes.json()) as { data: Site[] }).data);
      if (sourcesRes.ok) {
        setReferralSources(((await sourcesRes.json()) as { data: ReferralSource[] }).data);
      }
    })();
  }, []);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (siteFilter) params.set('site_id', siteFilter);
      if (studyFilter) params.set('study_id', studyFilter);

      const res = await fetch(`/api/leads?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load leads');
      const json = (await res.json()) as { data: Lead[] };
      setLeads(json.data);
    } catch {
      setError('Failed to load leads. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, siteFilter, studyFilter]);

  useEffect(() => {
    void fetchLeads();
  }, [fetchLeads]);

  const studyName = (studyId: string | null) =>
    studies.find((s) => s.id === studyId)?.study_name ?? '—';
  const siteName = (siteId: string | null) =>
    siteId ? (sites.find((s) => s.id === siteId)?.name ?? '—') : 'Unassigned (pool)';
  const sourceName = (sourceId: string | null) =>
    sourceId ? (referralSources.find((s) => s.id === sourceId)?.name ?? '—') : '—';

  return (
    <div>
      <PageHeader
        title="Recruitment"
        description="Track prospective participants from first contact through eligibility triage"
        action={
          <div className="flex gap-2">
            <Link href="/recruitment/dashboard">
              <Button variant="outline">Dashboard</Button>
            </Link>
            <Link href="/recruitment/new">
              <Button>New Lead</Button>
            </Link>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          placeholder="All statuses"
          options={STATUS_OPTIONS}
        />
        <Select
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
          placeholder="All sites (incl. unassigned pool)"
          options={sites.map((s) => ({ value: s.id, label: s.name }))}
        />
        <Select
          value={studyFilter}
          onChange={(e) => setStudyFilter(e.target.value)}
          placeholder="All studies"
          options={studies.map((s) => ({ value: s.id, label: s.study_name }))}
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
      ) : leads.length === 0 ? (
        <EmptyState
          title="No leads yet"
          description="Add your first lead to start the recruitment pipeline"
          action={
            <Link href="/recruitment/new">
              <Button>New Lead</Button>
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Lead</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Study</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Site</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Referral Source</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Contact Attempts</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/recruitment/${lead.id}`} className="hover:underline">
                      {lead.initials ?? 'New lead'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{studyName(lead.study_id)}</td>
                  <td className="px-4 py-3 text-gray-600">{siteName(lead.site_id)}</td>
                  <td className="px-4 py-3 text-gray-600">{sourceName(lead.referral_source_id)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[lead.status]}>
                      {lead.status.replace(/_/g, ' ')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{lead.contact_attempt_count}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/recruitment/${lead.id}`}>
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

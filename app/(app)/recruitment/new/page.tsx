'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { AlertBanner } from '@/components/ui/AlertBanner';
import type { Lead, ReferralSource } from '@/types/recruitment';
import type { Study } from '@/types/studies';
import type { Site } from '@/types/sites';

type LeadForm = {
  site_id: string;
  study_id: string;
  referral_source_id: string;
};

const EMPTY_FORM: LeadForm = { site_id: '', study_id: '', referral_source_id: '' };

export default function NewLeadPage() {
  const router = useRouter();
  const [form, setForm] = useState<LeadForm>(EMPTY_FORM);
  const [studies, setStudies] = useState<Study[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [referralSources, setReferralSources] = useState<ReferralSource[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: form.site_id || undefined,
          study_id: form.study_id || undefined,
          referral_source_id: form.referral_source_id || undefined,
        }),
      });
      const json = (await res.json()) as { success: boolean; data?: Lead; message?: string };
      if (!res.ok || !json.success || !json.data) {
        setError(json.message ?? 'Failed to create lead');
        return;
      }
      router.push(`/recruitment/${json.data.id}`);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="New Lead"
        description="Add a prospective participant to the recruitment pool"
      />

      {error && (
        <div className="mb-4">
          <AlertBanner variant="error" message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-sm text-gray-500">
          A lead doesn&apos;t need a site yet — it can sit in the company-wide pool until a study
          and location are determined. Contact information is added from the lead&apos;s profile
          once it&apos;s created.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Study (optional)"
            value={form.study_id}
            onChange={(e) => setForm((f) => ({ ...f, study_id: e.target.value }))}
            placeholder="Not yet matched"
            options={studies.map((s) => ({ value: s.id, label: s.study_name }))}
          />
          <Select
            label="Site (optional)"
            value={form.site_id}
            onChange={(e) => setForm((f) => ({ ...f, site_id: e.target.value }))}
            placeholder="Unassigned (pool)"
            options={sites.map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>
        <Select
          label="Referral source (optional)"
          value={form.referral_source_id}
          onChange={(e) => setForm((f) => ({ ...f, referral_source_id: e.target.value }))}
          placeholder="Unknown"
          options={referralSources.map((s) => ({ value: s.id, label: s.name }))}
        />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => router.push('/recruitment')}>
            Cancel
          </Button>
          <Button loading={saving} disabled={saving} onClick={() => void handleSave()}>
            Create Lead
          </Button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { usePermissions } from '@/hooks/usePermissions';
import type { Subject } from '@/types/subjects';
import type { Study } from '@/types/studies';
import type { Site } from '@/types/sites';

type SubjectForm = {
  study_id: string;
  site_id: string;
  subject_number: string;
  initials: string;
  screening_date: string;
};

const EMPTY_FORM: SubjectForm = {
  study_id: '',
  site_id: '',
  subject_number: '',
  initials: '',
  screening_date: '',
};

export default function NewSubjectPage() {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const [form, setForm] = useState<SubjectForm>(EMPTY_FORM);
  const [studies, setStudies] = useState<Study[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [sitesLoaded, setSitesLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [studiesRes, sitesRes] = await Promise.all([
        fetch('/api/studies?status=active'),
        fetch('/api/sites'),
      ]);
      if (studiesRes.ok) setStudies(((await studiesRes.json()) as { data: Study[] }).data);
      if (sitesRes.ok) {
        const fetchedSites = ((await sitesRes.json()) as { data: Site[] }).data;
        setSites(fetchedSites);
        // Typical single-site CRC workflow: skip the picker and auto-assign the
        // subject to the only site the user can access.
        if (fetchedSites.length === 1) {
          setForm((f) => ({ ...f, site_id: fetchedSites[0]?.id ?? '' }));
        }
      }
      setSitesLoaded(true);
    })();
  }, []);

  function stripEmpty(f: SubjectForm): Record<string, string> {
    return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '')) as Record<
      string,
      string
    >;
  }

  async function handleSave() {
    if (!form.study_id) {
      setError('Study is required');
      return;
    }
    if (!form.site_id) {
      setError('Site is required');
      return;
    }
    if (!form.subject_number.trim()) {
      setError('Subject number is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stripEmpty(form)),
      });
      const json = (await res.json()) as { success: boolean; data?: Subject; message?: string };
      if (!res.ok || !json.success || !json.data) {
        setError(json.message ?? 'Failed to create subject');
        return;
      }
      router.push(`/subjects/${json.data.id}`);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  }

  const singleSite = sites.length === 1 ? sites[0] : null;
  const noSites = sitesLoaded && sites.length === 0;
  // A caller with view_all_sites sees every site in the company — if /api/sites
  // still came back empty for them, no site exists yet, not that access is denied.
  const noSitesExistYet = noSites && hasPermission('view_all_sites');

  return (
    <div className="max-w-2xl">
      <PageHeader title="New Subject" description="Enroll a subject in an active study" />

      {error && (
        <div className="mb-4">
          <AlertBanner variant="error" message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {noSitesExistYet && (
        <div className="mb-4 space-y-2">
          <AlertBanner
            variant="error"
            message="No Sites have been created yet. Please create a Site first."
          />
          {hasPermission('manage_sites') && (
            <Button size="sm" variant="outline" onClick={() => router.push('/settings/sites')}>
              Go to Sites
            </Button>
          )}
        </div>
      )}

      {noSites && !noSitesExistYet && (
        <div className="mb-4">
          <AlertBanner
            variant="error"
            message="No sites are available to you yet. Ask an administrator to create a site or assign you to one."
          />
        </div>
      )}

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Study"
            value={form.study_id}
            onChange={(e) => setForm((f) => ({ ...f, study_id: e.target.value }))}
            placeholder="Select a study"
            options={studies.map((s) => ({ value: s.id, label: s.study_name }))}
            required
          />
          {singleSite ? (
            <div className="space-y-1">
              <span className="block text-sm font-medium text-slate-700">Site</span>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900">
                {singleSite.name}
              </p>
            </div>
          ) : (
            <Select
              label="Site"
              value={form.site_id}
              onChange={(e) => setForm((f) => ({ ...f, site_id: e.target.value }))}
              placeholder="Select a site"
              options={sites.map((s) => ({ value: s.id, label: s.name }))}
              required
            />
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Subject number"
            value={form.subject_number}
            onChange={(e) => setForm((f) => ({ ...f, subject_number: e.target.value }))}
            required
            placeholder="001-001"
          />
          <Input
            label="Initials"
            value={form.initials}
            onChange={(e) => setForm((f) => ({ ...f, initials: e.target.value }))}
            placeholder="J.D."
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Screening date"
            type="date"
            value={form.screening_date}
            onChange={(e) => setForm((f) => ({ ...f, screening_date: e.target.value }))}
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => router.push('/subjects')}>
            Cancel
          </Button>
          <Button loading={saving} disabled={saving || noSites} onClick={() => void handleSave()}>
            Create Subject
          </Button>
        </div>
      </div>
    </div>
  );
}

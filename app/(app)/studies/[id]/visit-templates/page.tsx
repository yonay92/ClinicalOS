'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { VisitTemplateBuilder } from '@/components/studies/VisitTemplateBuilder';
import type { VisitTemplateWithItems, VisitTemplateStatus } from '@/types/studies';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'default' | 'primary' | 'info';

const STATUS_VARIANT: Record<VisitTemplateStatus, BadgeVariant> = {
  draft: 'default',
  approved: 'success',
  archived: 'danger',
};

export default function VisitTemplatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: studyId } = use(params);
  const [templates, setTemplates] = useState<VisitTemplateWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/studies/${studyId}/visit-templates`);
      if (!res.ok) return;
      const json = (await res.json()) as { data: VisitTemplateWithItems[] };
      setTemplates(json.data);
    } finally {
      setLoading(false);
    }
  }, [studyId]);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  async function handleApprove(templateId: string) {
    setBusyId(templateId);
    try {
      await fetch(`/api/visit-templates/${templateId}/approve`, { method: 'POST' });
      void fetchTemplates();
    } finally {
      setBusyId(null);
    }
  }

  async function handleArchive(templateId: string) {
    setBusyId(templateId);
    try {
      await fetch(`/api/visit-templates/${templateId}/archive`, { method: 'POST' });
      void fetchTemplates();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Visit Templates"
        description="Build and version the visit schedule for this study"
      />

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <div className="mb-8 space-y-3">
          {templates.map((template) => (
            <div key={template.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                  Version {template.version} ({template.source})
                </h3>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[template.status]}>{template.status}</Badge>
                  {template.status === 'draft' && (
                    <Button
                      size="sm"
                      loading={busyId === template.id}
                      disabled={busyId === template.id}
                      onClick={() => void handleApprove(template.id)}
                    >
                      Approve
                    </Button>
                  )}
                  {template.status !== 'archived' && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busyId === template.id}
                      disabled={busyId === template.id}
                      onClick={() => void handleArchive(template.id)}
                    >
                      Archive
                    </Button>
                  )}
                </div>
              </div>
              <ul className="space-y-1 text-sm text-gray-600">
                {template.items.map((item) => (
                  <li key={item.id} className="flex justify-between border-t border-gray-100 py-1">
                    <span>{item.visit_name}</span>
                    <span className="text-gray-400">
                      Day {item.offset_days} (±{item.window_before}/{item.window_after})
                      {item.is_required ? '' : ' — optional'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Create New Draft Version</h2>
        <VisitTemplateBuilder studyId={studyId} onSaved={() => void fetchTemplates()} />
      </div>
    </div>
  );
}

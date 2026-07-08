'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { StudyAiExtraction } from '@/types/studies';

const EXTRACTION_LABELS: Record<StudyAiExtraction['extraction_type'], string> = {
  study_profile: 'Study Profile',
  visit_template: 'Visit Template',
  inclusion_criteria: 'Inclusion Criteria',
  exclusion_criteria: 'Exclusion Criteria',
  schedule_of_assessments: 'Schedule of Assessments',
  protocol_amendment_comparison: 'Protocol Amendment Comparison',
};

function confidenceVariant(confidence: number | null): 'success' | 'warning' | 'danger' {
  if (confidence === null) return 'danger';
  if (confidence >= 0.8) return 'success';
  if (confidence >= 0.5) return 'warning';
  return 'danger';
}

export function AIExtractionReview({
  extraction,
  onApproved,
}: {
  extraction: StudyAiExtraction;
  onApproved: () => void;
}) {
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`/api/studies/${extraction.study_id}/approve-ai-extraction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extraction_id: extraction.id }),
      });
      const json = (await res.json()) as { success: boolean; message?: string };
      if (!res.ok || !json.success) {
        setError(json.message ?? 'Failed to approve extraction');
        return;
      }
      onApproved();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          {EXTRACTION_LABELS[extraction.extraction_type]}
        </h3>
        <Badge variant={confidenceVariant(extraction.confidence)}>
          Confidence:{' '}
          {extraction.confidence !== null ? `${Math.round(extraction.confidence * 100)}%` : 'N/A'}
        </Badge>
      </div>

      <pre className="max-h-64 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
        {JSON.stringify(extraction.extracted_data, null, 2)}
      </pre>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-3 flex justify-end">
        {extraction.approved ? (
          <Badge variant="success">Approved</Badge>
        ) : (
          <Button
            size="sm"
            loading={approving}
            disabled={approving}
            onClick={() => void handleApprove()}
          >
            Approve
          </Button>
        )}
      </div>
    </div>
  );
}

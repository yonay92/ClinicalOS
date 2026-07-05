'use client';

import { useState, useEffect, useCallback } from 'react';
import { AIExtractionReview } from '@/components/studies/AIExtractionReview';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import type { StudyAiExtraction } from '@/types/studies';

export function AIReviewPanel({ studyId }: { studyId: string }) {
  const [extractions, setExtractions] = useState<StudyAiExtraction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExtractions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/studies/${studyId}/ai-extractions`);
      if (!res.ok) return;
      const json = (await res.json()) as { data: StudyAiExtraction[] };
      setExtractions(json.data);
    } finally {
      setLoading(false);
    }
  }, [studyId]);

  useEffect(() => {
    void fetchExtractions();
  }, [fetchExtractions]);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (extractions.length === 0) {
    return (
      <EmptyState
        title="No AI extractions yet"
        description="Upload a protocol to generate an AI-drafted study for review"
      />
    );
  }

  return (
    <div className="space-y-4">
      {extractions.map((extraction) => (
        <AIExtractionReview
          key={extraction.id}
          extraction={extraction}
          onApproved={() => void fetchExtractions()}
        />
      ))}
    </div>
  );
}

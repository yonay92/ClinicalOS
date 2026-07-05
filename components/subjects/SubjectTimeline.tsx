'use client';

import { useState, useEffect } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import type { SubjectTimelineEvent } from '@/types/subjects';

export function SubjectTimeline({ subjectId }: { subjectId: string }) {
  const [events, setEvents] = useState<SubjectTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/subjects/${subjectId}/timeline`);
        if (res.ok) {
          const json = (await res.json()) as { data: SubjectTimelineEvent[] };
          setEvents(json.data);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [subjectId]);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <EmptyState
        title="No timeline events yet"
        description="Key subject events (creation, status changes, visits) appear here"
      />
    );
  }

  return (
    <ol className="space-y-4 border-l border-gray-200 pl-4">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-blue-500" />
          <p className="text-sm font-medium text-gray-900">
            {event.event_type.replace(/_/g, ' ')}
          </p>
          {event.description && <p className="text-sm text-gray-600">{event.description}</p>}
          <p className="text-xs text-gray-400">{new Date(event.event_date).toLocaleString()}</p>
        </li>
      ))}
    </ol>
  );
}

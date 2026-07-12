'use client';

import { format } from 'date-fns';
import { EmptyState } from '@/components/ui/EmptyState';
import { CalendarEventChip } from '@/components/calendar/CalendarEventChip';
import type { CalendarEvent } from '@/types/calendar';

export function DayView({
  day,
  events,
  onSelectEvent,
}: {
  day: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  const dayEvents = events
    .filter((event) => event.start_datetime.slice(0, 10) === format(day, 'yyyy-MM-dd'))
    .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">
        {format(day, 'EEEE, MMMM d, yyyy')}
      </h3>
      {dayEvents.length === 0 ? (
        <EmptyState title="No events" description="Nothing scheduled for this day" />
      ) : (
        <div className="space-y-2">
          {dayEvents.map((event) => (
            <div key={event.id} className="rounded-lg border border-gray-100">
              <CalendarEventChip event={event} onClick={() => onSelectEvent(event)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

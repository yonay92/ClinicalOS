'use client';

import { format } from 'date-fns';
import { EmptyState } from '@/components/ui/EmptyState';
import { CalendarEventChip } from '@/components/calendar/CalendarEventChip';
import { groupEventsByDay } from '@/lib/utils/calendarGrouping';
import type { CalendarEvent } from '@/types/calendar';

export function DayView({
  day,
  events,
  onSelectEvent,
  siteNames,
  studyNames,
}: {
  day: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  siteNames: Map<string, string>;
  studyNames: Map<string, string>;
}) {
  const eventsByDay = groupEventsByDay(events);
  const dayEvents = (eventsByDay.get(format(day, 'yyyy-MM-dd')) ?? [])
    .slice()
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
              <CalendarEventChip
                event={event}
                onClick={() => onSelectEvent(event)}
                siteName={siteNames.get(event.site_id)}
                studyName={
                  event.related_study_id ? studyNames.get(event.related_study_id) : undefined
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

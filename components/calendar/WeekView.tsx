'use client';

import { startOfWeek, endOfWeek, eachDayOfInterval, isToday, format } from 'date-fns';
import { CalendarEventChip } from '@/components/calendar/CalendarEventChip';
import { groupEventsByDay } from '@/lib/utils/calendarGrouping';
import type { CalendarEvent } from '@/types/calendar';

export function WeekView({
  week,
  events,
  onSelectEvent,
  siteNames,
  studyNames,
}: {
  week: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  siteNames: Map<string, string>;
  studyNames: Map<string, string>;
}) {
  const days = eachDayOfInterval({ start: startOfWeek(week), end: endOfWeek(week) });
  const eventsByDay = groupEventsByDay(events);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDay.get(key) ?? [];
          return (
            <div key={key} className="min-h-[300px] border-r border-gray-100 p-2 last:border-r-0">
              <div className="mb-2 text-center">
                <div className="text-xs font-medium text-gray-500">{format(day, 'EEE')}</div>
                <div
                  className={`mx-auto mt-1 flex h-6 w-6 items-center justify-center rounded-full text-sm font-medium ${
                    isToday(day) ? 'bg-blue-600 text-white' : 'text-gray-700'
                  }`}
                >
                  {format(day, 'd')}
                </div>
              </div>
              <div className="space-y-1">
                {dayEvents.map((event) => (
                  <CalendarEventChip
                    key={event.id}
                    event={event}
                    onClick={() => onSelectEvent(event)}
                    siteName={siteNames.get(event.site_id)}
                    studyName={
                      event.related_study_id ? studyNames.get(event.related_study_id) : undefined
                    }
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

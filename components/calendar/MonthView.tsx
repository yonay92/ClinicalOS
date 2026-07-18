'use client';

import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  format,
} from 'date-fns';
import { CalendarEventChip } from '@/components/calendar/CalendarEventChip';
import { groupEventsByDay } from '@/lib/utils/calendarGrouping';
import type { CalendarEvent } from '@/types/calendar';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthView({
  month,
  events,
  onSelectEvent,
  siteNames,
  studyNames,
}: {
  month: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  siteNames: Map<string, string>;
  studyNames: Map<string, string>;
}) {
  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const eventsByDay = groupEventsByDay(events);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-2 text-center text-xs font-medium text-gray-500">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDay.get(key) ?? [];
          return (
            <div
              key={key}
              className={`min-h-[110px] border-r border-b border-gray-100 p-1.5 ${
                isSameMonth(day, month) ? 'bg-white' : 'bg-gray-50'
              }`}
            >
              <div
                className={`mb-1 text-xs font-medium ${
                  isToday(day)
                    ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white'
                    : isSameMonth(day, month)
                      ? 'text-gray-700'
                      : 'text-gray-400'
                }`}
              >
                {format(day, 'd')}
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

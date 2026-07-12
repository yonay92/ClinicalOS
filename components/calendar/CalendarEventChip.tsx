'use client';

import type { CalendarEvent, CalendarEventStatus } from '@/types/calendar';

// Mirrors the STATUS_VARIANT badge pattern from SubjectVisitsList.tsx for visual
// consistency between the Subject Profile Visits tab and the Calendar.
const STATUS_CLASSES: Record<CalendarEventStatus, string> = {
  scheduled: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
  confirmed: 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200',
  completed: 'bg-green-100 text-green-700 hover:bg-green-200',
  cancelled: 'bg-slate-100 text-slate-400 line-through hover:bg-slate-200',
};

export function CalendarEventChip({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={event.title}
      className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium ${STATUS_CLASSES[event.status]}`}
    >
      {event.title}
    </button>
  );
}

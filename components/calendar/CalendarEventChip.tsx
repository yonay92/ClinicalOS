'use client';

import type { CalendarEvent, CalendarEventStatus } from '@/types/calendar';

// Mirrors the STATUS_VARIANT badge pattern used elsewhere (e.g.
// SubjectVisitsList.tsx) for visual consistency, with one deliberate
// exception: 'in_progress' gets its own orange, since Badge.tsx has no
// orange variant and the existing app-wide convention (in_progress -> blue,
// same as confirmed) is exactly the bug this color spec fixes — in_progress
// and confirmed must be visually distinct on the Calendar.
export const CALENDAR_STATUS_CLASSES: Record<CalendarEventStatus, string> = {
  scheduled: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
  confirmed: 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  in_progress: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
  completed: 'bg-green-100 text-green-700 hover:bg-green-200',
  cancelled: 'bg-slate-100 text-slate-400 line-through hover:bg-slate-200',
};

export const CALENDAR_STATUS_LABELS: Record<CalendarEventStatus, string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function CalendarEventChip({
  event,
  onClick,
  siteName,
  studyName,
}: {
  event: CalendarEvent;
  onClick: () => void;
  siteName?: string | undefined;
  studyName?: string | undefined;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-xs font-medium ${CALENDAR_STATUS_CLASSES[event.status]}`}
      >
        {event.title}
      </button>
      {/* Hover tooltip — desktop only, secondary to the click panel which
          remains the primary and complete interaction (this is never the
          only place any of this information is available). */}
      <div className="pointer-events-none absolute top-full left-0 z-20 mt-1 hidden w-56 rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-lg group-hover:md:block">
        <p className="font-semibold text-gray-900">
          {event.related_subject_number ?? 'Unscheduled'}
        </p>
        <p className="text-gray-700">{event.title}</p>
        {studyName && <p className="text-gray-500">{studyName}</p>}
        {siteName && <p className="text-gray-500">{siteName}</p>}
        <p className="mt-1 text-gray-500">
          {CALENDAR_STATUS_LABELS[event.status]} &middot; {event.start_datetime.slice(0, 10)}
        </p>
      </div>
    </div>
  );
}

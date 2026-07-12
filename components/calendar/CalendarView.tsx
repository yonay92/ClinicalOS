'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  format,
} from 'date-fns';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { MonthView } from '@/components/calendar/MonthView';
import { WeekView } from '@/components/calendar/WeekView';
import { DayView } from '@/components/calendar/DayView';
import { VisitDetailPanel } from '@/components/calendar/VisitDetailPanel';
import type { CalendarEvent, CalendarViewMode } from '@/types/calendar';

function getRange(mode: CalendarViewMode, anchor: Date): { start: Date; end: Date } {
  if (mode === 'month')
    return { start: startOfWeek(startOfMonth(anchor)), end: endOfWeek(endOfMonth(anchor)) };
  if (mode === 'week') return { start: startOfWeek(anchor), end: endOfWeek(anchor) };
  return { start: anchor, end: anchor };
}

export function CalendarView() {
  const [mode, setMode] = useState<CalendarViewMode>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getRange(mode, anchor);
      const params = new URLSearchParams({
        start: format(start, 'yyyy-MM-dd'),
        end: format(end, 'yyyy-MM-dd'),
      });
      const res = await fetch(`/api/visits?${params.toString()}`);
      if (!res.ok) {
        setEvents([]);
        return;
      }
      const json = (await res.json()) as { data: CalendarEvent[] };
      setEvents(json.data);
    } finally {
      setLoading(false);
    }
  }, [mode, anchor]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  function goToday() {
    setAnchor(new Date());
  }

  function goPrev() {
    setAnchor((prev) =>
      mode === 'month'
        ? subMonths(prev, 1)
        : mode === 'week'
          ? subWeeks(prev, 1)
          : subDays(prev, 1),
    );
  }

  function goNext() {
    setAnchor((prev) =>
      mode === 'month'
        ? addMonths(prev, 1)
        : mode === 'week'
          ? addWeeks(prev, 1)
          : addDays(prev, 1),
    );
  }

  const heading = mode === 'day' ? format(anchor, 'MMMM d, yyyy') : format(anchor, 'MMMM yyyy');

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={goPrev} aria-label="Previous">
            ‹
          </Button>
          <Button size="sm" variant="outline" onClick={goToday}>
            Today
          </Button>
          <Button size="sm" variant="outline" onClick={goNext} aria-label="Next">
            ›
          </Button>
          <h2 className="ml-2 text-lg font-semibold text-gray-900">{heading}</h2>
        </div>
        <div className="flex gap-1 rounded-lg border border-gray-200 p-0.5">
          {(['month', 'week', 'day'] as CalendarViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors ${
                mode === m ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : mode === 'month' ? (
        <MonthView month={anchor} events={events} onSelectEvent={setSelectedEvent} />
      ) : mode === 'week' ? (
        <WeekView week={anchor} events={events} onSelectEvent={setSelectedEvent} />
      ) : (
        <DayView day={anchor} events={events} onSelectEvent={setSelectedEvent} />
      )}

      <VisitDetailPanel
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onChanged={() => void fetchEvents()}
      />
    </div>
  );
}

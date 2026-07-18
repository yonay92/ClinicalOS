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
import { AlertBanner } from '@/components/ui/AlertBanner';
import { MonthView } from '@/components/calendar/MonthView';
import { WeekView } from '@/components/calendar/WeekView';
import { DayView } from '@/components/calendar/DayView';
import { VisitDetailPanel } from '@/components/calendar/VisitDetailPanel';
import {
  CalendarFilterBar,
  EMPTY_CALENDAR_FILTERS,
  type CalendarFilterState,
} from '@/components/calendar/CalendarFilterBar';
import type { CalendarEvent, CalendarViewMode } from '@/types/calendar';
import type { Site } from '@/types/sites';
import type { Study, CrcOption } from '@/types/studies';

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
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [filters, setFilters] = useState<CalendarFilterState>(EMPTY_CALENDAR_FILTERS);

  const [sites, setSites] = useState<Site[]>([]);
  const [studies, setStudies] = useState<Study[]>([]);
  const [crcOptions, setCrcOptions] = useState<CrcOption[]>([]);

  // Fetched once — reused for filter dropdown options, and for resolving
  // site/study names for the tooltip and detail panel without per-event fetches.
  useEffect(() => {
    void (async () => {
      const [sitesRes, studiesRes, crcRes] = await Promise.all([
        fetch('/api/sites'),
        fetch('/api/studies'),
        fetch('/api/studies/crc-options'),
      ]);
      if (sitesRes.ok) setSites(((await sitesRes.json()) as { data: Site[] }).data);
      if (studiesRes.ok) setStudies(((await studiesRes.json()) as { data: Study[] }).data);
      if (crcRes.ok) setCrcOptions(((await crcRes.json()) as { data: CrcOption[] }).data);
    })();
  }, []);

  const siteNames = new Map(sites.map((s) => [s.id, s.name]));
  const studyNames = new Map(studies.map((s) => [s.id, s.study_name]));

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getRange(mode, anchor);
      const params = new URLSearchParams({
        start: format(start, 'yyyy-MM-dd'),
        end: format(end, 'yyyy-MM-dd'),
      });
      if (filters.site_id) params.set('site_id', filters.site_id);
      if (filters.study_id) params.set('study_id', filters.study_id);
      if (filters.status) params.set('status', filters.status);
      if (filters.crc_user_id) params.set('crc_user_id', filters.crc_user_id);

      const res = await fetch(`/api/visits?${params.toString()}`);
      if (!res.ok) {
        setEvents([]);
        setError('Failed to load calendar events. Please try again.');
        return;
      }
      const json = (await res.json()) as { data: CalendarEvent[] };
      setEvents(json.data);
    } catch {
      setEvents([]);
      setError('Failed to load calendar events. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [mode, anchor, filters]);

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

      <CalendarFilterBar
        filters={filters}
        onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
        onReset={() => setFilters(EMPTY_CALENDAR_FILTERS)}
        sites={sites}
        studies={studies}
        crcOptions={crcOptions}
      />

      {error && (
        <div className="mb-4">
          <AlertBanner variant="error" message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : mode === 'month' ? (
        <MonthView
          month={anchor}
          events={events}
          onSelectEvent={setSelectedEvent}
          siteNames={siteNames}
          studyNames={studyNames}
        />
      ) : mode === 'week' ? (
        <WeekView
          week={anchor}
          events={events}
          onSelectEvent={setSelectedEvent}
          siteNames={siteNames}
          studyNames={studyNames}
        />
      ) : (
        <DayView
          day={anchor}
          events={events}
          onSelectEvent={setSelectedEvent}
          siteNames={siteNames}
          studyNames={studyNames}
        />
      )}

      <VisitDetailPanel
        event={selectedEvent}
        siteName={selectedEvent ? siteNames.get(selectedEvent.site_id) : undefined}
        onClose={() => setSelectedEvent(null)}
        onChanged={() => void fetchEvents()}
      />
    </div>
  );
}

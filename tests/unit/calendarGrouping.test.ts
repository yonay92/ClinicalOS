import { describe, it, expect } from 'vitest';
import { groupEventsByDay } from '@/lib/utils/calendarGrouping';
import type { CalendarEvent } from '@/types/calendar';

function makeEvent(overrides: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    company_id: 'company-1',
    site_id: 'site-1',
    event_type: 'patient_visit',
    title: 'Week 8',
    description: null,
    start_datetime: '2026-07-14T00:00:00Z',
    end_datetime: '2026-07-14T00:00:00Z',
    related_record_type: 'visits',
    related_record_id: 'visit-1',
    status: 'scheduled',
    created_by: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('groupEventsByDay', () => {
  it('groups events by the plain UTC date-string slice of start_datetime', () => {
    const eventA = makeEvent({ id: 'a', start_datetime: '2026-07-14T00:00:00Z' });
    const eventB = makeEvent({ id: 'b', start_datetime: '2026-07-14T00:00:00.000Z' });
    const eventC = makeEvent({ id: 'c', start_datetime: '2026-07-15T00:00:00Z' });

    const result = groupEventsByDay([eventA, eventB, eventC]);

    expect(result.get('2026-07-14')?.map((e) => e.id)).toEqual(['a', 'b']);
    expect(result.get('2026-07-15')?.map((e) => e.id)).toEqual(['c']);
  });

  it('returns an empty map for an empty input', () => {
    expect(groupEventsByDay([]).size).toBe(0);
  });

  it('does not group events on days with no matching event', () => {
    const result = groupEventsByDay([makeEvent({ id: 'a' })]);
    expect(result.get('2026-01-01')).toBeUndefined();
  });

  it('preserves insertion order within a day (stable grouping)', () => {
    const eventA = makeEvent({ id: 'a', title: 'Baseline' });
    const eventB = makeEvent({ id: 'b', title: 'Screening' });
    const result = groupEventsByDay([eventA, eventB]);
    expect(result.get('2026-07-14')?.map((e) => e.title)).toEqual(['Baseline', 'Screening']);
  });
});

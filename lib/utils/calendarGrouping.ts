import type { CalendarEvent } from '@/types/calendar';

// Shared by MonthView/WeekView/DayView — previously duplicated identically in
// all three. Keys by the plain UTC date-string slice of start_datetime (no
// Date object, no timezone conversion), matching how createCalendarEventsForVisits
// always writes `${target_date}T00:00:00Z`.
export function groupEventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = event.start_datetime.slice(0, 10);
    const list = eventsByDay.get(key) ?? [];
    list.push(event);
    eventsByDay.set(key, list);
  }
  return eventsByDay;
}

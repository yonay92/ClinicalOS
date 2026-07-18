import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CalendarEventChip,
  CALENDAR_STATUS_CLASSES,
  CALENDAR_STATUS_LABELS,
} from '@/components/calendar/CalendarEventChip';
import type { CalendarEvent, CalendarEventStatus } from '@/types/calendar';

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'event-1',
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

describe('CalendarEventChip — status colors', () => {
  const cases: Array<[CalendarEventStatus, string]> = [
    ['scheduled', 'bg-slate-100'],
    ['confirmed', 'bg-blue-100'],
    ['in_progress', 'bg-orange-100'],
    ['completed', 'bg-green-100'],
    ['cancelled', 'bg-slate-100'],
  ];

  it.each(cases)('renders the %s color class', (status, expectedClass) => {
    const { container } = render(
      <CalendarEventChip event={makeEvent({ status })} onClick={() => {}} />,
    );
    const button = container.querySelector('button');
    expect(button?.className).toContain(expectedClass);
  });

  it('gives in_progress and confirmed visually distinct colors — the bug this fixes', () => {
    // Regression: the pre-fix app-wide convention mapped in_progress -> the
    // same 'primary'/blue as confirmed, making them indistinguishable.
    expect(CALENDAR_STATUS_CLASSES.in_progress).not.toBe(CALENDAR_STATUS_CLASSES.confirmed);
    expect(CALENDAR_STATUS_CLASSES.in_progress).toContain('orange');
    expect(CALENDAR_STATUS_CLASSES.confirmed).toContain('blue');
  });

  it('covers all 5 CalendarEventStatus values with no gaps', () => {
    const statuses: CalendarEventStatus[] = [
      'scheduled',
      'confirmed',
      'in_progress',
      'completed',
      'cancelled',
    ];
    for (const status of statuses) {
      expect(CALENDAR_STATUS_CLASSES[status]).toBeTruthy();
      expect(CALENDAR_STATUS_LABELS[status]).toBeTruthy();
    }
  });
});

describe('CalendarEventChip — interaction', () => {
  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<CalendarEventChip event={makeEvent()} onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Week 8' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('CalendarEventChip — hover tooltip', () => {
  it('shows subject number, study, site, and status', () => {
    const event = makeEvent({ related_subject_number: '001-001' });
    const { container } = render(
      <CalendarEventChip
        event={event}
        onClick={() => {}}
        siteName="Main Site"
        studyName="ACME-01"
      />,
    );
    expect(container.textContent).toContain('001-001');
    expect(container.textContent).toContain('ACME-01');
    expect(container.textContent).toContain('Main Site');
    expect(container.textContent).toContain(CALENDAR_STATUS_LABELS.scheduled);
  });

  it('falls back gracefully when enrichment fields are absent, rather than showing nothing', () => {
    const { container } = render(
      <CalendarEventChip
        event={makeEvent({ related_subject_number: undefined })}
        onClick={() => {}}
      />,
    );
    expect(container.textContent).toContain('Unscheduled');
  });
});

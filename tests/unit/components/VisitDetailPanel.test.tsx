import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { VisitDetailPanel } from '@/components/calendar/VisitDetailPanel';
import type { CalendarEvent } from '@/types/calendar';
import type { Visit } from '@/types/subjects';

const SUBJECT_ID = 'subject-1';
const STUDY_ID = 'study-1';
const VISIT_ID = 'visit-1';

function makeVisit(overrides: Partial<Visit> = {}): Visit {
  return {
    id: VISIT_ID,
    company_id: 'company-1',
    site_id: 'site-1',
    study_id: STUDY_ID,
    subject_id: SUBJECT_ID,
    visit_template_item_id: null,
    visit_name: 'Week 8',
    visit_type: 'scheduled',
    target_date: '2026-07-14',
    scheduled_date: null,
    window_start: '2026-07-07',
    window_end: '2026-07-21',
    status: 'scheduled',
    created_by: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

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
    related_record_id: VISIT_ID,
    status: 'scheduled',
    created_by: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function mockFetchFor(options: {
  visit: Visit;
  permissions?: string[];
  notes?: Array<{ id: string; note: string; created_at: string }>;
}) {
  const permissions = options.permissions ?? [];
  const notes = options.notes ?? [];

  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const json = (data: unknown) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ data }) } as Response);

    if (url === '/api/users/me/permissions') return json({ permissions });
    if (url === `/api/visits/${VISIT_ID}`) return json(options.visit);
    if (url === `/api/subjects/${SUBJECT_ID}`) return json({ subject_number: '001-001' });
    if (url === `/api/subjects/${SUBJECT_ID}/visits`) return json([options.visit]);
    if (url === `/api/studies/${STUDY_ID}/visit-templates`) return json([]);
    if (url === `/api/studies/${STUDY_ID}`) return json({ study_name: 'ACME-01' });
    if (url === `/api/subjects/${SUBJECT_ID}/visits/${VISIT_ID}/notes`) return json(notes);

    return Promise.resolve({ ok: false, json: () => Promise.resolve({ data: null }) } as Response);
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('VisitDetailPanel — status-gated actions', () => {
  it('shows only Confirm for a Scheduled visit', async () => {
    global.fetch = mockFetchFor({ visit: makeVisit({ status: 'scheduled' }) });
    render(
      <VisitDetailPanel
        event={makeEvent()}
        siteName="Main Site"
        onClose={() => {}}
        onChanged={() => {}}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Confirm' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Complete' })).toBeNull();
  });

  it('shows only Start for a Confirmed visit', async () => {
    global.fetch = mockFetchFor({ visit: makeVisit({ status: 'confirmed' }) });
    render(
      <VisitDetailPanel
        event={makeEvent()}
        siteName="Main Site"
        onClose={() => {}}
        onChanged={() => {}}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Start' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
  });

  it('shows the "no actions available" fallback for a Cancelled visit', async () => {
    global.fetch = mockFetchFor({ visit: makeVisit({ status: 'cancelled' }) });
    render(
      <VisitDetailPanel
        event={makeEvent()}
        siteName="Main Site"
        onClose={() => {}}
        onChanged={() => {}}
      />,
    );

    expect(await screen.findByText('No actions available for this visit.')).toBeTruthy();
  });

  it('does not show Reopen for a Completed visit when the caller lacks reopen_visit', async () => {
    global.fetch = mockFetchFor({ visit: makeVisit({ status: 'completed' }), permissions: [] });
    render(
      <VisitDetailPanel
        event={makeEvent()}
        siteName="Main Site"
        onClose={() => {}}
        onChanged={() => {}}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText('No actions available for this visit.')).toBeTruthy(),
    );
  });

  it('shows Reopen for a Completed visit when the caller has reopen_visit', async () => {
    global.fetch = mockFetchFor({
      visit: makeVisit({ status: 'completed' }),
      permissions: ['reopen_visit'],
    });
    render(
      <VisitDetailPanel
        event={makeEvent()}
        siteName="Main Site"
        onClose={() => {}}
        onChanged={() => {}}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Reopen' })).toBeTruthy();
  });
});

describe('VisitDetailPanel — fields', () => {
  it('renders Study, Site, Visit Name, and falls back to — for empty dates', async () => {
    global.fetch = mockFetchFor({
      visit: makeVisit({ target_date: null, window_start: null, window_end: null }),
    });
    render(
      <VisitDetailPanel
        event={makeEvent()}
        siteName="Main Site"
        onClose={() => {}}
        onChanged={() => {}}
      />,
    );

    expect(await screen.findByText('ACME-01')).toBeTruthy();
    expect(screen.getByText('Main Site')).toBeTruthy();
    expect(screen.getAllByText('Week 8').length).toBeGreaterThan(0);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('renders — for Site when siteName is not resolvable', async () => {
    global.fetch = mockFetchFor({ visit: makeVisit() });
    render(
      <VisitDetailPanel
        event={makeEvent()}
        siteName={undefined}
        onClose={() => {}}
        onChanged={() => {}}
      />,
    );

    await screen.findByText('ACME-01');
    expect(screen.getByText('Site').nextElementSibling?.textContent).toBe('—');
  });
});

describe('VisitDetailPanel — notes', () => {
  it('shows the Notes section when notes exist', async () => {
    global.fetch = mockFetchFor({
      visit: makeVisit({ status: 'confirmed' }),
      notes: [
        {
          id: 'note-1',
          note: 'Patient requested a later date',
          created_at: '2026-07-01T00:00:00Z',
        },
      ],
    });
    render(
      <VisitDetailPanel
        event={makeEvent()}
        siteName="Main Site"
        onClose={() => {}}
        onChanged={() => {}}
      />,
    );

    expect(await screen.findByText('Notes')).toBeTruthy();
    expect(screen.getByText('Patient requested a later date')).toBeTruthy();
  });

  it('omits the Notes section entirely when there are none', async () => {
    global.fetch = mockFetchFor({ visit: makeVisit(), notes: [] });
    render(
      <VisitDetailPanel
        event={makeEvent()}
        siteName="Main Site"
        onClose={() => {}}
        onChanged={() => {}}
      />,
    );

    await screen.findByText('ACME-01');
    expect(screen.queryByText('Notes')).toBeNull();
  });
});

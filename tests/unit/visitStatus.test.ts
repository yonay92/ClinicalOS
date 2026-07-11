import { describe, it, expect } from 'vitest';
import { classifyVisit } from '@/lib/utils/visitStatus';
import type { Visit, VisitStatus } from '@/types/subjects';

const TODAY = new Date('2026-06-15T00:00:00Z');

function makeVisit(overrides: Partial<Visit> & { status: VisitStatus }): Visit {
  return {
    id: 'visit-1',
    company_id: 'company-1',
    site_id: 'site-1',
    study_id: 'study-1',
    subject_id: 'subject-1',
    visit_template_item_id: null,
    visit_name: 'Week 4',
    visit_type: 'scheduled',
    target_date: null,
    scheduled_date: null,
    window_start: null,
    window_end: null,
    created_by: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('classifyVisit', () => {
  it('maps completed to completed', () => {
    expect(classifyVisit(makeVisit({ status: 'completed' }), TODAY)).toBe('completed');
  });

  it('maps out_of_window to completed (the visit occurred, just late)', () => {
    expect(classifyVisit(makeVisit({ status: 'out_of_window' }), TODAY)).toBe('completed');
  });

  it('maps missed to missed', () => {
    expect(classifyVisit(makeVisit({ status: 'missed' }), TODAY)).toBe('missed');
  });

  it('maps cancelled to cancelled', () => {
    expect(classifyVisit(makeVisit({ status: 'cancelled' }), TODAY)).toBe('cancelled');
  });

  it('maps in_progress to due', () => {
    expect(classifyVisit(makeVisit({ status: 'in_progress' }), TODAY)).toBe('due');
  });

  it('treats a scheduled visit with no window as upcoming', () => {
    expect(classifyVisit(makeVisit({ status: 'scheduled' }), TODAY)).toBe('upcoming');
  });

  it('is upcoming when today is before the window opens', () => {
    const visit = makeVisit({
      status: 'scheduled',
      window_start: '2026-06-20',
      window_end: '2026-06-27',
    });
    expect(classifyVisit(visit, TODAY)).toBe('upcoming');
  });

  it('is due on the exact day the window opens', () => {
    const visit = makeVisit({
      status: 'confirmed',
      window_start: '2026-06-15',
      window_end: '2026-06-22',
    });
    expect(classifyVisit(visit, TODAY)).toBe('due');
  });

  it('is due while today falls inside the window', () => {
    const visit = makeVisit({
      status: 'scheduled',
      window_start: '2026-06-10',
      window_end: '2026-06-20',
    });
    expect(classifyVisit(visit, TODAY)).toBe('due');
  });

  it('is due on the exact day the window closes', () => {
    const visit = makeVisit({
      status: 'rescheduled',
      window_start: '2026-06-01',
      window_end: '2026-06-15',
    });
    expect(classifyVisit(visit, TODAY)).toBe('due');
  });

  it('is overdue the day after the window closes', () => {
    const visit = makeVisit({
      status: 'scheduled',
      window_start: '2026-06-01',
      window_end: '2026-06-14',
    });
    expect(classifyVisit(visit, TODAY)).toBe('overdue');
  });
});

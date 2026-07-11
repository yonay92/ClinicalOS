import { describe, it, expect } from 'vitest';
import { getVisitLockStatus, sortVisitsByOrder } from '@/lib/utils/visitSequencing';
import type { Visit, VisitStatus } from '@/types/subjects';
import type { VisitTemplateItem } from '@/types/studies';

const TEMPLATE_ID = 'template-1';

function makeItem(overrides: Partial<VisitTemplateItem> & { id: string }): VisitTemplateItem {
  return {
    company_id: 'company-1',
    template_id: TEMPLATE_ID,
    visit_name: 'Visit',
    visit_order: 1,
    offset_days: 0,
    window_before: 0,
    window_after: 0,
    visit_type: 'scheduled',
    is_required: true,
    is_baseline: false,
    notes: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function makeVisit(overrides: Partial<Visit> & { status: VisitStatus }): Visit {
  return {
    id: 'visit-1',
    company_id: 'company-1',
    site_id: 'site-1',
    study_id: 'study-1',
    subject_id: 'subject-1',
    visit_template_item_id: null,
    visit_name: 'Visit',
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

describe('getVisitLockStatus', () => {
  it('is never locked for an unscheduled visit (no linked template item)', () => {
    const visit = makeVisit({ status: 'scheduled', visit_template_item_id: null });
    expect(getVisitLockStatus(visit, [visit], [])).toEqual({ locked: false });
  });

  it('is unlocked when there are no predecessors at all', () => {
    const item = makeItem({ id: 'item-1', visit_order: 1 });
    const visit = makeVisit({ status: 'scheduled', visit_template_item_id: 'item-1' });
    expect(getVisitLockStatus(visit, [visit], [item])).toEqual({ locked: false });
  });

  it('is unlocked when the only predecessor is optional (is_required: false)', () => {
    const optionalItem = makeItem({
      id: 'item-1',
      visit_order: 1,
      visit_name: 'Optional Visit',
      is_required: false,
    });
    const item = makeItem({ id: 'item-2', visit_order: 2, visit_name: 'Week 4' });
    const visit = makeVisit({ status: 'scheduled', visit_template_item_id: 'item-2' });
    // Optional predecessor's visit doesn't even exist as a row.
    expect(getVisitLockStatus(visit, [visit], [optionalItem, item])).toEqual({ locked: false });
  });

  it('is locked when a required predecessor visit has no row at all', () => {
    const predItem = makeItem({ id: 'item-1', visit_order: 1, visit_name: 'Screening' });
    const item = makeItem({ id: 'item-2', visit_order: 2, visit_name: 'Baseline' });
    const visit = makeVisit({
      id: 'visit-baseline',
      status: 'scheduled',
      visit_template_item_id: 'item-2',
      visit_name: 'Baseline',
    });
    const result = getVisitLockStatus(visit, [visit], [predItem, item]);
    expect(result).toEqual({
      locked: true,
      reason: 'Complete the required visit first: Screening',
      blockedBy: ['Screening'],
    });
  });

  it('is locked when a required predecessor visit exists but is not yet completed', () => {
    const predItem = makeItem({ id: 'item-1', visit_order: 1, visit_name: 'Screening' });
    const item = makeItem({ id: 'item-2', visit_order: 2, visit_name: 'Baseline' });
    const predVisit = makeVisit({
      id: 'visit-screening',
      status: 'scheduled',
      visit_template_item_id: 'item-1',
      visit_name: 'Screening',
    });
    const visit = makeVisit({
      id: 'visit-baseline',
      status: 'scheduled',
      visit_template_item_id: 'item-2',
      visit_name: 'Baseline',
    });
    const result = getVisitLockStatus(visit, [predVisit, visit], [predItem, item]);
    expect(result.locked).toBe(true);
  });

  it('is unlocked when the required predecessor visit is completed', () => {
    const predItem = makeItem({ id: 'item-1', visit_order: 1, visit_name: 'Screening' });
    const item = makeItem({ id: 'item-2', visit_order: 2, visit_name: 'Baseline' });
    const predVisit = makeVisit({
      id: 'visit-screening',
      status: 'completed',
      visit_template_item_id: 'item-1',
    });
    const visit = makeVisit({
      id: 'visit-baseline',
      status: 'scheduled',
      visit_template_item_id: 'item-2',
    });
    expect(getVisitLockStatus(visit, [predVisit, visit], [predItem, item])).toEqual({
      locked: false,
    });
  });

  it('treats out_of_window as done — the predecessor visit occurred, just late', () => {
    const predItem = makeItem({ id: 'item-1', visit_order: 1, visit_name: 'Screening' });
    const item = makeItem({ id: 'item-2', visit_order: 2, visit_name: 'Baseline' });
    const predVisit = makeVisit({
      id: 'visit-screening',
      status: 'out_of_window',
      visit_template_item_id: 'item-1',
    });
    const visit = makeVisit({
      id: 'visit-baseline',
      status: 'scheduled',
      visit_template_item_id: 'item-2',
    });
    expect(getVisitLockStatus(visit, [predVisit, visit], [predItem, item])).toEqual({
      locked: false,
    });
  });

  it('lists multiple incomplete required predecessors sorted by visit_order', () => {
    const item1 = makeItem({ id: 'item-1', visit_order: 1, visit_name: 'Screening' });
    const item2 = makeItem({ id: 'item-2', visit_order: 2, visit_name: 'Baseline' });
    const item3 = makeItem({ id: 'item-3', visit_order: 3, visit_name: 'Week 4' });
    const visit = makeVisit({
      id: 'visit-week8',
      status: 'scheduled',
      visit_template_item_id: 'item-4',
    });
    const item4 = makeItem({ id: 'item-4', visit_order: 4, visit_name: 'Week 8' });
    // item2's predecessor (item1) comes later in the input array than item2, to prove sorting.
    const result = getVisitLockStatus(visit, [visit], [item2, item1, item3, item4]);
    expect(result).toEqual({
      locked: true,
      reason: 'Complete the required visits first: Screening, Baseline, Week 4',
      blockedBy: ['Screening', 'Baseline', 'Week 4'],
    });
  });

  it('never locks based on visit name — only visit_order and is_required matter', () => {
    // A predecessor named "Randomization" (not "Screening"/"Baseline") still blocks.
    const predItem = makeItem({ id: 'item-1', visit_order: 1, visit_name: 'Randomization' });
    const item = makeItem({ id: 'item-2', visit_order: 2, visit_name: 'Anything' });
    const visit = makeVisit({ status: 'scheduled', visit_template_item_id: 'item-2' });
    const result = getVisitLockStatus(visit, [visit], [predItem, item]);
    expect(result.locked).toBe(true);
  });
});

describe('sortVisitsByOrder', () => {
  it('sorts by visit_order even though Screening has no target_date (Postgres would sort NULLs last)', () => {
    const screeningItem = makeItem({
      id: 'item-screening',
      visit_order: 1,
      visit_name: 'Screening',
    });
    const baselineItem = makeItem({ id: 'item-baseline', visit_order: 2, visit_name: 'Baseline' });
    const week4Item = makeItem({ id: 'item-week4', visit_order: 3, visit_name: 'Week 4' });

    // Screening has no target_date (null) — a target_date sort would push it last.
    const screening = makeVisit({
      status: 'scheduled',
      visit_template_item_id: 'item-screening',
      visit_name: 'Screening',
      target_date: null,
    });
    const baseline = makeVisit({
      status: 'scheduled',
      visit_template_item_id: 'item-baseline',
      visit_name: 'Baseline',
      target_date: null,
    });
    const week4 = makeVisit({
      status: 'scheduled',
      visit_template_item_id: 'item-week4',
      visit_name: 'Week 4',
      target_date: '2026-07-09',
    });

    // Input deliberately out of order, with the null-target_date visits first/last mixed in.
    const result = sortVisitsByOrder(
      [week4, screening, baseline],
      [week4Item, screeningItem, baselineItem],
    );

    expect(result.map((v) => v.visit_name)).toEqual(['Screening', 'Baseline', 'Week 4']);
  });

  it('matches the full 8-visit protocol order regardless of input order or null dates', () => {
    const names = [
      'Screening',
      'Baseline',
      'Week 4',
      'Week 8',
      'Week 12',
      'Week 24',
      'Week 36',
      'Week 52',
    ];
    const items = names.map((name, index) =>
      makeItem({ id: `item-${index}`, visit_order: index + 1, visit_name: name }),
    );
    const visits = names.map((name, index) =>
      makeVisit({
        status: 'scheduled',
        visit_template_item_id: `item-${index}`,
        visit_name: name,
        // Only Baseline onward have a computed target_date; Screening does not.
        target_date: index === 0 ? null : '2026-07-09',
      }),
    );

    // Shuffle both inputs to prove the sort doesn't depend on arrival order.
    const shuffledVisits = [...visits].reverse();
    const shuffledItems = [...items].reverse();

    const result = sortVisitsByOrder(shuffledVisits, shuffledItems);
    expect(result.map((v) => v.visit_name)).toEqual(names);
  });

  it('places visits with no linked template item (unscheduled) after ordered visits, preserving relative order', () => {
    const item = makeItem({ id: 'item-1', visit_order: 1, visit_name: 'Baseline' });
    const ordered = makeVisit({
      status: 'scheduled',
      visit_template_item_id: 'item-1',
      visit_name: 'Baseline',
    });
    const unscheduledA = makeVisit({
      id: 'unscheduled-a',
      status: 'scheduled',
      visit_template_item_id: null,
      visit_name: 'Unscheduled A',
    });
    const unscheduledB = makeVisit({
      id: 'unscheduled-b',
      status: 'scheduled',
      visit_template_item_id: null,
      visit_name: 'Unscheduled B',
    });

    const result = sortVisitsByOrder([unscheduledA, unscheduledB, ordered], [item]);
    expect(result.map((v) => v.visit_name)).toEqual(['Baseline', 'Unscheduled A', 'Unscheduled B']);
  });

  it('does not mutate the input array', () => {
    const item = makeItem({ id: 'item-1', visit_order: 1 });
    const visits = [makeVisit({ status: 'scheduled', visit_template_item_id: 'item-1' })];
    const result = sortVisitsByOrder(visits, [item]);
    expect(result).not.toBe(visits);
  });
});

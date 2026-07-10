import type { Visit, VisitStatus } from '@/types/subjects';
import type { VisitTemplateItem } from '@/types/studies';

// Shared by SubjectService (server-side enforcement) and the subject profile UI
// (client-side "why is this locked" explanation) — one implementation, no duplicated
// business logic. A visit is locked until every required, lower-visit_order visit in
// the same template has been completed. Purely order/required-driven — never keyed by
// visit name.
export type VisitLockStatus =
  { locked: false } | { locked: true; reason: string; blockedBy: string[] };

const DONE_STATUSES: VisitStatus[] = ['completed', 'out_of_window'];

export function getVisitLockStatus(
  visit: Visit,
  allVisits: Visit[],
  templateItems: VisitTemplateItem[],
): VisitLockStatus {
  if (!visit.visit_template_item_id) return { locked: false };

  const item = templateItems.find((i) => i.id === visit.visit_template_item_id);
  if (!item) return { locked: false };

  const requiredPredecessors = templateItems
    .filter(
      (i) =>
        i.template_id === item.template_id && i.visit_order < item.visit_order && i.is_required,
    )
    .sort((a, b) => a.visit_order - b.visit_order);

  if (requiredPredecessors.length === 0) return { locked: false };

  const visitByItemId = new Map(allVisits.map((v) => [v.visit_template_item_id, v]));

  const incomplete = requiredPredecessors.filter((predItem) => {
    const predVisit = visitByItemId.get(predItem.id);
    return !predVisit || !DONE_STATUSES.includes(predVisit.status);
  });

  if (incomplete.length === 0) return { locked: false };

  const names = incomplete.map((i) => i.visit_name);
  return {
    locked: true,
    reason: `Complete the required visit${names.length > 1 ? 's' : ''} first: ${names.join(', ')}`,
    blockedBy: names,
  };
}

// Visits must always display in protocol sequence, not by target_date — pre-Baseline
// items (e.g. Screening) have no target_date until anchored, and a plain ASC sort would
// push them to the end (Postgres sorts NULLs last by default). Visits with no linked
// template item (unscheduled visits) sort after every ordered visit, preserving their
// relative input order (Array.prototype.sort is stable).
export function sortVisitsByOrder(visits: Visit[], templateItems: VisitTemplateItem[]): Visit[] {
  const orderByItemId = new Map(templateItems.map((i) => [i.id, i.visit_order]));

  return [...visits].sort((a, b) => {
    const orderA = a.visit_template_item_id
      ? orderByItemId.get(a.visit_template_item_id)
      : undefined;
    const orderB = b.visit_template_item_id
      ? orderByItemId.get(b.visit_template_item_id)
      : undefined;

    if (orderA === undefined && orderB === undefined) return 0;
    if (orderA === undefined) return 1;
    if (orderB === undefined) return -1;
    return orderA - orderB;
  });
}

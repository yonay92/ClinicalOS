import type { Visit, VisitStatus } from '@/types/subjects';

// Display-only scheduling bucket for a visit. Never persisted — visits.status
// remains the source of truth; this derives a coarser grouping for list/board UIs.
// `missed` transitions happen server-side (supabase/functions/visit-status-checker),
// this only classifies visits that are still pending against today's date.
export type VisitScheduleBucket =
  'upcoming' | 'due' | 'overdue' | 'completed' | 'missed' | 'cancelled';

const PENDING_STATUSES: VisitStatus[] = ['scheduled', 'confirmed', 'rescheduled'];

export function classifyVisit(visit: Visit, today: Date = new Date()): VisitScheduleBucket {
  switch (visit.status) {
    case 'completed':
    case 'out_of_window':
      return 'completed';
    case 'missed':
      return 'missed';
    case 'cancelled':
      return 'cancelled';
    case 'in_progress':
      return 'due';
    default:
      break;
  }

  if (!PENDING_STATUSES.includes(visit.status)) return 'upcoming';
  if (!visit.window_start || !visit.window_end) return 'upcoming';

  const todayStr = today.toISOString().slice(0, 10);
  if (todayStr > visit.window_end) return 'overdue';
  if (todayStr >= visit.window_start) return 'due';
  return 'upcoming';
}

import type { Subject, SubjectStatus } from '@/types/subjects';
import type { Study } from '@/types/studies';

// A subject counts as "Enrolled" once they've passed screening into the study.
// pre_screening and screening are still deciding; screen_failed never enrolled.
export const ENROLLED_SUBJECT_STATUSES: SubjectStatus[] = [
  'randomized',
  'active',
  'completed',
  'early_terminated',
  'lost_to_follow_up',
];

export function countActiveStudies(studies: Study[]): number {
  return studies.filter((s) => s.status === 'active').length;
}

export function countEnrolledSubjects(subjects: Subject[]): number {
  return subjects.filter((s) => ENROLLED_SUBJECT_STATUSES.includes(s.status)).length;
}

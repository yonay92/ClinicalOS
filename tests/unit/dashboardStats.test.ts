import { describe, it, expect } from 'vitest';
import {
  countActiveStudies,
  countEnrolledSubjects,
  ENROLLED_SUBJECT_STATUSES,
} from '@/lib/utils/dashboardStats';
import type { Study, StudyStatus } from '@/types/studies';
import type { Subject, SubjectStatus } from '@/types/subjects';

function makeStudy(status: StudyStatus): Study {
  return {
    id: `study-${status}`,
    company_id: 'company-1',
    study_name: 'Study',
    protocol_number: null,
    sponsor: null,
    cro: null,
    phase: null,
    therapeutic_area: null,
    indication: null,
    estimated_enrollment: null,
    study_duration: null,
    study_design: null,
    primary_endpoint: null,
    status,
    start_date: null,
    end_date: null,
    protocol_version: null,
    ai_generated: false,
    created_by: null,
    created_at: '',
    updated_at: '',
  };
}

function makeSubject(status: SubjectStatus): Subject {
  return {
    id: `subject-${status}`,
    company_id: 'company-1',
    site_id: 'site-1',
    study_id: 'study-1',
    subject_number: '001-001',
    initials: null,
    status,
    screening_date: null,
    baseline_date: null,
    randomization_date: null,
    randomization_number: null,
    end_of_study_date: null,
    created_by: null,
    created_at: '',
    updated_at: '',
  };
}

describe('countActiveStudies', () => {
  it('returns 0 for an empty list', () => {
    expect(countActiveStudies([])).toBe(0);
  });

  it('counts only status active, excluding draft/on_hold/closed/archived', () => {
    const studies = [
      makeStudy('active'),
      makeStudy('active'),
      makeStudy('draft'),
      makeStudy('on_hold'),
      makeStudy('closed'),
      makeStudy('archived'),
    ];
    expect(countActiveStudies(studies)).toBe(2);
  });
});

describe('countEnrolledSubjects', () => {
  it('returns 0 for an empty list', () => {
    expect(countEnrolledSubjects([])).toBe(0);
  });

  it('excludes pre_screening, screening, and screen_failed', () => {
    const subjects = [
      makeSubject('pre_screening'),
      makeSubject('screening'),
      makeSubject('screen_failed'),
    ];
    expect(countEnrolledSubjects(subjects)).toBe(0);
  });

  it('counts every status in ENROLLED_SUBJECT_STATUSES', () => {
    const subjects = ENROLLED_SUBJECT_STATUSES.map((status) => makeSubject(status));
    expect(countEnrolledSubjects(subjects)).toBe(ENROLLED_SUBJECT_STATUSES.length);
  });

  it('counts a realistic mixed cohort correctly', () => {
    const subjects = [
      makeSubject('pre_screening'),
      makeSubject('screening'),
      makeSubject('screening'),
      makeSubject('screen_failed'),
      makeSubject('randomized'),
      makeSubject('active'),
      makeSubject('active'),
      makeSubject('completed'),
      makeSubject('early_terminated'),
      makeSubject('lost_to_follow_up'),
    ];
    // Enrolled: randomized, active x2, completed, early_terminated, lost_to_follow_up = 6
    expect(countEnrolledSubjects(subjects)).toBe(6);
  });
});

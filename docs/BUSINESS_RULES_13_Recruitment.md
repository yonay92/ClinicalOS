# BUSINESS RULES 13 - Recruitment & Patient Management

## Lead Lifecycle

Statuses: `new → contacted → prescreening → waitlisted → converted` / `declined` / `lost`.

`converted`, `declined`, and `lost` are terminal — no further pipeline action is permitted once
a lead reaches one of them.

A Lead is a distinct entity from a Subject. It never touches `visits`, `calendar_events`, or the
Visit Template engine. It only becomes a Subject on conversion.

## Site Assignment

A lead does not require a `site_id` at creation — it exists in a company-wide pool. Once
assigned to a site, normal site-based RLS applies (`can_access_site`). Unassigned leads are
visible to any caller in the company holding `view_leads`.

## Contact Attempts

Every contact attempt is logged append-only to `lead_contact_log` (mirrors
`appointment_confirmation_log`). Each attempt increments `contact_attempt_count` and updates
`last_contacted_at`; `next_contact_at` is set explicitly per attempt for follow-up scheduling.

## Prescreening

Each Study defines its own prescreening questionnaire (`study_prescreening_questions`) — no
draft/approve versioning; questions are editable in place.

A Lead may be prescreened for multiple Studies, or re-prescreened for the same Study, without
losing any prior attempt — every submission creates a new, immutable `lead_prescreenings` row.
Question text and type are snapshotted onto each answer at submission time, so a later edit to
the question never changes the meaning of a historical answer.

### Scoring

- `yes_no` and `number` questions score automatically against the question's configured
  `eligible_answer` / `min_eligible_value` / `max_eligible_value`. `text` questions never score.
- A question marked `is_hard_exclusion`: an ineligible answer to it alone forces the outcome to
  `not_eligible`, regardless of every other answer.
- Any other ineligible (non-hard-exclusion) answer downgrades the outcome to `needs_review`.
- With no ineligible answers, the outcome is `potentially_eligible`.

### Manual Override

Staff may always override the computed outcome (`manual_outcome` + a mandatory
`manual_override_reason`). The computed outcome is never discarded — both are kept for audit.
Wherever eligibility is checked (e.g. conversion), the _effective_ outcome is
`manual_outcome ?? computed_outcome`.

## Conversion (Lead → Subject)

Trigger: staff-initiated, requires `convert_lead`.

Preconditions, in order:

1. The lead must have a `site_id` and a `study_id` assigned.
2. The most recent `lead_prescreenings` row for that `study_id` must have an effective outcome
   other than `not_eligible` (none at all also blocks conversion).
3. The lead must have contact info on file, including `date_of_birth` and `sex` — both optional
   at the recruitment stage, but required on `subject_contact_info` (Subjects need them for
   clinical purposes).

Actions:

- Create the Subject via the existing `SubjectService.create` — the same active-study,
  approved-template, and site-assigned-to-study rules apply unchanged; conversion never bypasses
  them.
- Copy the lead's contact info into a new `subject_contact_info` row.
- Mark the lead `converted`, set `converted_subject_id` and `converted_at`.

All of the above happens atomically from the caller's perspective — if the Subject already has
enrollment implications, they are audited on the Subject side exactly as a manually-created
Subject would be.

## PHI

Lead contact information (name, DOB, sex, phone, email) is PHI, gated by `view_lead_phi` /
`edit_lead_phi` — the same permission model as Subject PHI, including the Administrator role's
default grant (see `DATABASE_Part_01`, migration 015). Prescreening records are not PHI-gated —
they're scoped to `view_leads` / `edit_lead`, since eligibility status and criteria answers were
scoped as operational data, not contact information, in this sprint's product decisions.

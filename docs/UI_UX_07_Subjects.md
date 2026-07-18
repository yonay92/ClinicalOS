# UI/UX 07 - Subjects

## Subject List

Filters:

- Study
- Site
- Status
- Subject Number

## Subject Profile

Tabs:

- Overview
- Visits
- Charts
- Timeline
- Notes
- Documents
- Contact Info
- History

### Contact Info tab

Name, date of birth, sex, phone (primary/secondary), email, preferred language, preferred
contact method, voicemail permission, and best time to contact — read-only display with an Edit
action, or an inline "Add contact information" form when nothing is on file yet.

Gated by the `view_subject_phi` / `edit_subject_phi` permissions, not `view_subjects` /
`edit_subject`. Unlike `reopen_visit` and `force_archive_*`, both permissions **are** part of the
Administrator role's default grant (migration 013 — a product decision, not the original
design). Every other role still requires a company owner to consciously enable them per-role from
Settings > Roles, same override mechanism as the dangerous-operation permissions. A user without
`view_subject_phi` does not see the tab's contents (shown as Restricted); without
`edit_subject_phi` they see the data read-only with no Edit action.

Saving contact info auto-generates the subject's `initials` (first + last initial) the first
time it's saved, if the subject doesn't already have any — initials are not PHI-gated, since
the Calendar already shows them to any caller with `view_visits`.

## Header

Shows Study, Site, Status and next scheduled visit.

## Actions

- Complete Baseline Visit (hidden once the Baseline Date is recorded)
- Randomize (available only in Screening status, hidden once randomized)
- Change Status
- Add Note
- Create Unscheduled Visit
- Upload Document

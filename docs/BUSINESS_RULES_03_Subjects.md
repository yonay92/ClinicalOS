# BUSINESS RULES 03 - Subjects

## Subject Creation

Required:

- Site (auto-assigned when the user has access to only one site)
- Study
- Subject Number

Optional:

- Initials
- Screening Date

Baseline Date and Randomization Date are not collected at creation — see Baseline
Visit Completion and Randomization below.

Actions:

- Validate Study is active.
- Validate Site assignment.
- Create Subject.
- Schedule the Baseline visit (placeholder — no date yet) from the approved Visit
  Template's designated Baseline item.
- Create Calendar Events.
- Add Timeline entry.

## Baseline Visit Completion

Trigger: the Baseline visit is completed (Baseline Date entered).

Actions:

- Record Baseline Date on the Subject.
- Mark the Baseline visit Completed.
- Generate the remaining Scheduled Visits from the approved Visit Template, anchored
  to Baseline Date.
- Add Timeline entry.

## Randomization

A dedicated action on the Subject Profile, available once the subject is in
Screening status.

Required:

- Randomization Number
- Randomization Date

Actions:

- Validate the subject is not already randomized.
- Validate the subject's status allows randomization (must be Screening).
- Record Randomization Number and Randomization Date.
- Change subject status to Randomized.
- Update timeline, write audit log, notify PI/CRC.

## Subject Status

Allowed Flow

Pre-Screening
→ Screening
→ Randomized
→ Active
→ Completed

Alternative:
Screen Failed
Early Terminated
Lost to Follow Up

Every status change:

- Update timeline.
- Write audit log.
- Recalculate analytics.

## Subject Completion

When End of Study is completed:

- Close remaining visits.
- Close remaining charts.
- Complete open subject tasks.

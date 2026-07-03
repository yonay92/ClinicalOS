# BUSINESS RULES 03 - Subjects

## Subject Creation

Required:

- Site
- Study
- Subject Number

Actions:

- Validate Study is active.
- Validate Site assignment.
- Create Subject.
- Generate Visit Schedule.
- Create Calendar Events.
- Add Timeline entry.

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

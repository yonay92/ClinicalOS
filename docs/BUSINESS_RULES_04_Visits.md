# BUSINESS RULES 04 - Visits

## Visit Generation

The Baseline visit and the rest of the protocol schedule are generated in two steps:

**At Subject creation:**

- Read the approved Visit Template's designated Baseline item (`is_baseline`).
- Create a placeholder Baseline visit (status Scheduled, no date yet).

**At Baseline visit completion (trigger: Baseline Date entered):**

- Mark the Baseline visit Completed with the entered date.
- Read the approved Visit Template's remaining items.
- Generate all other scheduled visits.
- Calculate target dates and visit windows, anchored to Baseline Date.
- Create calendar events.

## Unscheduled Visits

Users may create an unscheduled visit.

Rules:

- Must belong to an existing subject.
- Appears in Calendar.
- Creates Chart after completion.
- Creates Task automatically.

## Visit Completion

Trigger:
Status = Completed

Actions:

- Create Chart.
- Create Data Entry Task.
- Update Timeline.
- Update Analytics.

## Out of Window

If completion date is outside visit window:

- Mark Out of Window.
- Increase chart priority.
- Notify CRC.
- Record Audit Trail.

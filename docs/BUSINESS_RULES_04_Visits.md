# BUSINESS RULES 04 - Visits

## Visit Generation

Trigger:
Subject created.

Actions:
- Read approved Visit Template.
- Generate all scheduled visits.
- Calculate target dates.
- Calculate visit windows.
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

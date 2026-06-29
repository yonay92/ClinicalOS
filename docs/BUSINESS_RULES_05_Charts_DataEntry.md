# BUSINESS RULES 05 - Charts & Data Entry

## Chart Creation
Trigger: Visit status becomes Completed.

Actions:
- Create Chart.
- Link Visit, Subject, Study and Site.
- Calculate initial priority.
- Create Data Entry Task.
- Update Timeline.

## Priority Rules
Critical:
- Sponsor Visit approaching.
- >7 days overdue.
- Out of Window.

High:
- 4-7 days overdue.

Medium:
- 1-3 days overdue.

Low:
- All others.

## Entered in EDC
Only authorized Data Entry (or approved CRC) may mark Entered in EDC.
System records:
- entered_by
- entered_at
- audit log
- KPI update

CRC may view but not edit these fields after completion.

# UI/UX 08 - Visits

## Visit Calendar

Views:

- Month
- Week
- Day

All three views render the same event set, the same status colors, the same filters, and the
same click-through detail panel — there is no functional divergence between them.

### Status colors

Each calendar event is colored by its visit status:

- Scheduled — gray
- Confirmed — blue
- In Progress — orange
- Completed — green
- Cancelled — red (struck through)

### Filters

Available above the calendar grid, applied identically across Month/Week/Day, and never reset
the current date or view when changed:

- Site
- Study
- Status
- CRC (derived from active `study_staff` assignments — a CRC sees visits belonging to studies
  they're actively staffed on, not a fixed per-subject ownership model)

A "Reset filters" control clears all four at once.

### Hover tooltip

Hovering a calendar event (desktop only) shows a concise preview: Subject number, Visit name,
Study, Site, Status, and Target date. This is a convenience only — every one of these fields,
plus more, is always available via the click-through detail panel below. The tooltip is never
the only place information is available.

## Visit Detail

Opened by clicking any calendar event:

- Subject number (linked to the Subject Profile)
- Study
- Site
- Visit Name
- Target Date
- Window
- Actual Date
- Status
- Notes (shown only when the visit has any — e.g. a Reschedule reason)
- Contact Information (only rendered for a caller holding `view_subject_phi` — see below)
- The lifecycle actions currently valid for this visit's status and the caller's permissions

### Contact Information & Appointment Confirmation

Shown in the detail panel between the visit fields and the lifecycle actions, gated by the same
`view_subject_phi` / `edit_subject_phi` permissions as the Subject Profile's Contact Info tab
(§UI_UX_07_Subjects.md). Renders nothing for a caller without `view_subject_phi` — same silent
self-gate convention as Reopen.

- Name, primary phone, email, and voicemail permission, plus Call/Email/Copy-phone-number
  shortcuts
- Appointment confirmation status (`not_contacted`, `attempted`, `confirmed`, `left_voicemail`,
  `requested_reschedule`, `unable_to_reach`), last contacted timestamp, contact attempt count,
  and the latest contact notes
- "Log Contact Attempt" action (requires `edit_subject_phi`) — records a new status, optional
  notes, and increments the attempt count; a `requested_reschedule` outcome only records the
  request, it does not reschedule the visit — use the Reschedule action for that

This is a deliberately parallel tracking surface: logging a contact attempt never changes
`visits.status` or auto-starts a visit. Contacting a patient and the clinical visit lifecycle
(Confirm/Start/Reschedule/Cancel/Reopen below) are independent concerns, tracked in
`appointment_confirmations` / `appointment_confirmation_log`, separate from `visits` /
`visit_history`.

## Actions

- Confirm — Scheduled → Confirmed
- Start — Confirmed → In Progress
- Complete — In Progress → Completed (requires Actual Date)
- Reschedule — Scheduled or Confirmed only; new date + mandatory reason; does not change status
- Cancel — Scheduled, Confirmed, or In Progress only; mandatory reason; never deletes the visit
- Reopen — Completed → In Progress; requires the `reopen_visit` permission and a mandatory
  reason; only visible to callers who hold that permission

Completing a visit automatically creates the Chart and corresponding Task through Business
Rules.

## Future enhancement: drag-and-drop rescheduling

Not implemented. Dragging an event to a new date/time on the calendar looks simple but isn't —
it needs to become a full Reschedule, not a silent date change:

- A confirmation step before committing the move (the drop target isn't necessarily intentional)
- The same mandatory reschedule reason Reschedule already requires
- The same permission check Reschedule already enforces
- The same audit/timeline entries every other visit action writes
- Window recalculation against the visit template's `window_before`/`window_after`
- Safe rollback in the UI if the underlying Reschedule call fails (the event must not appear
  to have moved if the write didn't actually succeed)

Until this is built, use the Reschedule action from the detail panel.

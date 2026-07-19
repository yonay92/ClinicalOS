# UI/UX 18 - Recruitment

## Recruitment Pipeline (`/recruitment`)

Table view of all leads visible to the caller (company-wide pool plus any site-assigned leads
the caller can access). Filters: Status, Site (includes an "unassigned pool" option), Study.

Columns: Lead (initials, or "New lead" before contact info is on file), Study, Site
(shows "Unassigned (pool)" when not yet assigned), Referral Source, Status, Contact Attempts.

Actions: New Lead, Dashboard.

## New Lead (`/recruitment/new`)

Study, Site, and Referral Source are all optional at creation — a lead can sit in the
company-wide pool with nothing set beyond its existence. Contact information is added
afterward, from the lead's own profile.

## Lead Profile (`/recruitment/[id]`)

Header: initials (or "Lead" before contact info exists), Study · Site, and a status badge.

A banner appears above the two-column layout when the lead is `converted` (with a link to the
new Subject profile) or `declined` (showing the reason).

### Contact Information section

PHI-gated (`view_lead_phi` / `edit_lead_phi`). Renders "Restricted" for a caller without
`view_lead_phi`; renders an inline "Add Contact Information" form when nothing is on file yet,
or a read-only view with an Edit action once it exists. Fields: First/Last Name, Date of Birth
(optional), Sex (optional), Primary/Secondary Phone, Email, Preferred Contact Method.

### Pipeline Actions section

- **Log Contact Attempt** (`edit_lead_phi`) — records an outcome (Contacted / In Prescreening),
  optional notes, increments the attempt count.
- **Waitlist** / **Decline** (`edit_lead`) — Decline requires a reason.
- **Convert to Subject** (`convert_lead`) — prompts for a Subject number; blocked with a clear
  message if the lead is missing a site, a study, a supporting prescreening, or a date of
  birth/sex on file (see `BUSINESS_RULES_13_Recruitment.md`).
- **Contact History** — the full append-only log of contact attempts, visible to the same
  `view_lead_phi` audience as the contact info itself.

None of these actions are available once the lead reaches a terminal status (converted,
declined, lost).

### Prescreening section

Lists every past prescreening attempt (grouped by study, most recent first), each showing its
outcome badge, the individual question/answer pairs (an ineligible answer is highlighted), and —
if overridden — the manual outcome and reason. Staff with `edit_lead` can start a **New
Prescreening** (pick a study, answer its active questions) or **Override Outcome** on any past
attempt.

## Recruitment Dashboard (`/recruitment/dashboard`)

Funnel counts per status, overall conversion rate, and a referral-source breakdown — scoped by
the caller's site/company access, same as the pipeline list.

## Study Profile — Prescreening tab

New tab on the existing Study Profile page (`/studies/[id]`), alongside Visit Templates. Links
to `/studies/[id]/prescreening-questions` — the questionnaire builder: add a question (Yes/No,
Number, or free-text answer type; Yes/No and Number questions configure their eligible
answer/range and whether an ineligible answer is a hard exclusion), and remove (deactivate)
existing ones.

## Sidebar

New "Recruitment" nav item, gated by `view_leads`, positioned after Subjects.

# UI/UX 17 - Sites

## Site List

Filters:

- Search (name, site number, or city)
- View (Active / Archived / All — defaults to Active; archived sites are
  hidden unless Archived or All is selected)

## Site Profile Tabs

- Overview
- Studies
- Staff

## Site Details (Overview tab)

- Name
- Site Number
- Principal Investigator
- Address
- City / State / ZIP
- Phone
- Timezone
- Status

## Primary Actions

- Edit Site
- Activate / Deactivate Site
- Archive Site (never a hard delete — see
  `BUSINESS_RULES` in `DATABASE_Part_01_Core_SaaS_Users_Roles_Sites.md`, Site
  Archive Rule)

## Studies Tab

Shows studies assigned to this site (via `study_sites`), with the ability to
assign an unassigned study or remove an existing assignment. The Study
Profile's own Sites tab shows the same relationship from the study's side.

## Staff Tab

Shows users assigned to this site (via `user_sites`), each with their
role(s), with the ability to assign an unassigned user or remove an existing
assignment. This is the same relationship managed from the Users page's
"Manage Access" action — either surface can be used.

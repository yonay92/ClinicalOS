# BUSINESS RULES 02 - Studies

## Study Creation
Trigger:
- Admin creates study manually OR uploads protocol.

Rules:
- Protocol upload starts AI extraction.
- AI creates draft only.
- Human approval required.
- Assign one or more Sites.
- Activate study.
- Generate Visit Template.

## Protocol Amendment
Trigger:
New protocol version uploaded.

Actions:
- Compare versions.
- Highlight differences.
- Create new Visit Template version.
- Preserve previous version.
- Notify Regulatory and CRCs.

## Study Closeout
Actions:
- Prevent new Subjects.
- Preserve historical data.
- Archive Regulatory Binder.
- Generate closeout tasks.

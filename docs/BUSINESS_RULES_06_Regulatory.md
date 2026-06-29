# BUSINESS RULES 06 - Regulatory

## Document Upload
Trigger:
User uploads document.

Actions:
- Store file.
- AI extracts metadata.
- Determine document type.
- Calculate expiration.
- Create renewal task if needed.

## Expiration
Rules are configurable by document type.

Default notifications:
- 90 days
- 60 days
- 30 days
- 7 days
- Expired

## Document Health Score
100% = all required documents current.
Missing or expired documents reduce score.

No document is overwritten; every update creates a new version.

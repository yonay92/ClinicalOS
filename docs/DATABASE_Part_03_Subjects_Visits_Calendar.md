# DATABASE_Part_03.md

# ClinicalOS Database Architecture — Part 03

## Subjects, Visits, Calendar, Timelines

Version: 1.0  
Project: ClinicalOS

---

## 1. Purpose

This part defines the subject lifecycle and the operational calendar.

Subjects are the central clinical records. Visits are generated from Study Visit Templates. Calendar Events visualize operational activity.

---

## 2. Table: subjects

Stores each study subject.

```sql
subjects
- id uuid primary key
- company_id uuid references companies(id)
- site_id uuid references sites(id)
- study_id uuid references studies(id)
- subject_number text not null
- initials text
- status text default 'screening'
- screening_date date
- baseline_date date
- randomization_date date
- randomization_number text
- end_of_study_date date
- created_by uuid references profiles(id)
- created_at timestamptz default now()
- updated_at timestamptz default now()
```

### Status Values

- pre_screening
- screening
- screen_failed
- randomized
- active
- completed
- early_terminated
- lost_to_follow_up

### Rule

Subjects are not assigned to a fixed CRC. Actions are attributed to the user who performs them.

---

## 3. Table: subject_status_history

Stores subject status changes.

```sql
subject_status_history
- id uuid primary key
- company_id uuid references companies(id)
- subject_id uuid references subjects(id)
- old_status text
- new_status text
- changed_by uuid references profiles(id)
- changed_at timestamptz default now()
- reason text
```

---

## 4. Table: subject_notes

Stores internal notes.

```sql
subject_notes
- id uuid primary key
- company_id uuid references companies(id)
- subject_id uuid references subjects(id)
- note text not null
- visibility text default 'internal'
- created_by uuid references profiles(id)
- created_at timestamptz default now()
```

### Visibility Values

- internal
- crc_only
- admin_only

---

## 5. Table: subject_documents

Connects subject-related files.

```sql
subject_documents
- id uuid primary key
- company_id uuid references companies(id)
- subject_id uuid references subjects(id)
- file_id uuid references files(id)
- document_type text
- uploaded_by uuid references profiles(id)
- uploaded_at timestamptz default now()
- notes text
```

---

## 6. Table: subject_milestones

Stores key subject milestones.

```sql
subject_milestones
- id uuid primary key
- company_id uuid references companies(id)
- subject_id uuid references subjects(id)
- milestone_type text not null
- milestone_date date not null
- created_by uuid references profiles(id)
- created_at timestamptz default now()
```

### Milestone Examples

- consent_signed
- screening
- randomized
- first_dose
- last_dose
- end_of_treatment
- end_of_study

---

## 7. Table: subject_timeline

Stores a clinical timeline of subject events.

```sql
subject_timeline
- id uuid primary key
- company_id uuid references companies(id)
- subject_id uuid references subjects(id)
- event_type text not null
- event_date timestamptz not null
- description text
- related_record_type text
- related_record_id uuid
- created_by uuid references profiles(id)
- created_at timestamptz default now()
```

---

## 8. Table: visits

Stores scheduled and unscheduled subject visits.

```sql
visits
- id uuid primary key
- company_id uuid references companies(id)
- site_id uuid references sites(id)
- study_id uuid references studies(id)
- subject_id uuid references subjects(id)
- visit_template_item_id uuid references visit_template_items(id)
- visit_name text not null
- visit_type text default 'scheduled'
- target_date date
- scheduled_date date
- window_start date
- window_end date
- status text default 'scheduled'
- created_by uuid references profiles(id)
- created_at timestamptz default now()
- updated_at timestamptz default now()
```

### Visit Types

- scheduled
- unscheduled

### Visit Status

- scheduled
- confirmed
- in_progress
- completed
- missed
- rescheduled
- cancelled
- out_of_window

---

## 9. Table: visit_history

```sql
visit_history
- id uuid primary key
- company_id uuid references companies(id)
- visit_id uuid references visits(id)
- old_status text
- new_status text
- changed_by uuid references profiles(id)
- changed_at timestamptz default now()
- reason text
```

---

## 10. Table: visit_notes

```sql
visit_notes
- id uuid primary key
- company_id uuid references companies(id)
- visit_id uuid references visits(id)
- note text not null
- created_by uuid references profiles(id)
- created_at timestamptz default now()
```

---

## 11. Table: calendar_events

Displays patient visits and operational events.

```sql
calendar_events
- id uuid primary key
- company_id uuid references companies(id)
- site_id uuid references sites(id)
- event_type text not null
- title text not null
- description text
- start_datetime timestamptz not null
- end_datetime timestamptz
- related_record_type text
- related_record_id uuid
- status text default 'scheduled'
- created_by uuid references profiles(id)
- created_at timestamptz default now()
- updated_at timestamptz default now()
```

### Event Types

- patient_visit
- monitoring_visit
- sponsor_visit
- investigator_meeting
- staff_meeting
- training

### Rule

Patient Visit = `visits` + `calendar_events`.

Monitoring/Sponsor/Training = `calendar_events` only.

---

## 12. Automation

```text
Subject Created
→ Approved Visit Template Found
→ Baseline Visit Scheduled (placeholder, no date)
→ Calendar Events Created
→ Subject Timeline Updated
```

```text
Baseline Visit Completed (Baseline Date entered)
→ Baseline Visit Marked Completed
→ Remaining Scheduled Visits Generated (anchored to Baseline Date)
→ Calendar Events Created
→ Subject Timeline Updated
```

```text
Subject Randomized (dedicated Randomize action, Screening status only)
→ Randomization Number + Date Recorded
→ Subject Status → Randomized
→ Subject Timeline Updated
```

```text
Visit Completed
→ Chart Created
→ Data Entry Task Created
→ Analytics Updated
```

---

## 13. Implementation Notes for Claude

- Rescheduling a visit must update the related calendar event.
- Cancelled visits should not be deleted.
- Unscheduled visits should be stored in the same `visits` table with `visit_type = unscheduled`.
- Future visits may be recalculated when rescheduling, but only after user confirmation.

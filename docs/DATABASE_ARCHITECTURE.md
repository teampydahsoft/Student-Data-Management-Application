# Student Data Management — Database Architecture

This document describes the academic hierarchy, table schemas, and relationships in the `student_database` MySQL database.

---

## Overview

The database uses a **College → Course → Branch** organizational hierarchy with foreign keys. Students are stored separately and linked to configuration tables by **name strings** (not foreign keys). There is **no `batches` table** — batch is stored as a VARCHAR on relevant tables.

---

## High-Level Hierarchy

```
College
  └── Course
        └── Branch (course_branches)
              ├── Academic Year associations (branch_academic_years)
              ├── Section configuration (metadata JSON)
              ├── Additional year configuration (metadata JSON)
              └── Subject mappings (branch_semester_subjects)

Academic Year (calendar session)
  └── Semester rows (per college, course, batch, program year, sem number)

Student
  └── Section assignment (student_sections)
```

---

## Entity Relationship Diagram

```mermaid
erDiagram
    colleges ||--o{ courses : "college_id"
    courses ||--o{ course_branches : "course_id"
    course_branches ||--o{ branch_academic_years : "branch_id"
    academic_years ||--o{ branch_academic_years : "academic_year_id"
    colleges ||--o{ semesters : "college_id"
    courses ||--o{ semesters : "course_id"
    academic_years ||--o{ semesters : "academic_year_id"
    course_branches ||--o{ branch_semester_subjects : "branch_id"
    course_branches ||--o{ student_sections : "branch_id"
    students ||--o| student_sections : "student_id"

    colleges {
        int id PK
        varchar name UK
        varchar code UK
        text address
        boolean is_active
        json metadata
        timestamp created_at
        timestamp updated_at
    }

    courses {
        int id PK
        int college_id FK
        varchar name
        varchar code UK
        enum level
        tinyint total_years
        tinyint semesters_per_year
        json year_semester_config
        json metadata
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }

    course_branches {
        int id PK
        int course_id FK
        varchar name
        varchar code
        tinyint total_years
        tinyint semesters_per_year
        json year_semester_config
        json metadata
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }

    academic_years {
        int id PK
        varchar year_label UK
        date start_date
        date end_date
        boolean is_active
        boolean is_frozen
        timestamp created_at
        timestamp updated_at
    }

    branch_academic_years {
        int branch_id PK_FK
        int academic_year_id PK_FK
        timestamp created_at
    }

    semesters {
        int id PK
        int college_id FK
        int course_id FK
        int academic_year_id FK
        tinyint year_of_study
        varchar batch
        tinyint semester_number
        date start_date
        date end_date
        timestamp created_at
        timestamp updated_at
    }

    students {
        int id PK
        varchar college
        varchar course
        varchar branch
        varchar batch
        varchar section
        tinyint current_year
        tinyint current_semester
        varchar student_name
        varchar admission_number
        json custom_fields
        timestamp created_at
        timestamp updated_at
    }

    student_sections {
        int id PK
        int student_id FK UK
        int branch_id FK
        varchar batch
        varchar section_name
        tinyint is_manual
        timestamp created_at
        timestamp updated_at
    }

    branch_semester_subjects {
        int id PK
        int branch_id FK
        tinyint year_of_study
        tinyint semester_number
        int subject_id FK
        timestamp created_at
    }
```

---

## Core Tables

### `colleges`

Top-level organizational unit.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PRIMARY KEY, AUTO_INCREMENT | Unique identifier |
| `name` | VARCHAR(255) | NOT NULL, UNIQUE | College name (e.g. Pydah College of Engineering) |
| `code` | VARCHAR(50) | UNIQUE | Short code (e.g. PCE, PDC, PCP) |
| `address` | TEXT | NULL | Physical address |
| `is_active` | BOOLEAN | DEFAULT TRUE | Whether college is active |
| `metadata` | JSON | NULL | Additional configuration |
| `header_image` | LONGBLOB | NULL | Header image binary |
| `footer_image` | LONGBLOB | NULL | Footer image binary |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | |

---

### `courses`

Academic programs offered by a college.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PRIMARY KEY, AUTO_INCREMENT | Unique identifier |
| `college_id` | INT | FK → `colleges(id)`, ON DELETE SET NULL | Parent college |
| `name` | VARCHAR(255) | NOT NULL | Course name (e.g. B.Tech, Diploma) |
| `code` | VARCHAR(50) | UNIQUE | Course code |
| `level` | ENUM | `diploma`, `ug`, `pg` | Course level |
| `total_years` | TINYINT | NOT NULL, DEFAULT 4 | Program duration in years |
| `semesters_per_year` | TINYINT | NOT NULL, DEFAULT 2 | Default semesters per program year |
| `year_semester_config` | JSON | NULL | Per-year semester overrides |
| `metadata` | JSON | NULL | Additional configuration |
| `is_active` | BOOLEAN | DEFAULT TRUE | Whether course is active |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | |

**Unique constraint:** `(college_id, name)` — course names are unique within a college.

**`year_semester_config` example:**

```json
[
  { "year": 1, "semesters": 1 },
  { "year": 2, "semesters": 2 },
  { "year": 3, "semesters": 2 }
]
```

---

### `course_branches`

Branches (departments/specializations) under a course.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PRIMARY KEY, AUTO_INCREMENT | Unique identifier |
| `course_id` | INT | NOT NULL, FK → `courses(id)`, ON DELETE CASCADE | Parent course |
| `name` | VARCHAR(255) | NOT NULL | Branch name (e.g. CSE, ECE) |
| `code` | VARCHAR(50) | NULL | Branch code |
| `total_years` | TINYINT | NULL | Override of course duration |
| `semesters_per_year` | TINYINT | NULL | Override of course semesters |
| `year_semester_config` | JSON | NULL | Override of per-year semester config |
| `metadata` | JSON | NULL | Sections, additional year, and other config |
| `is_active` | BOOLEAN | DEFAULT TRUE | Whether branch is active |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | |

**Unique constraints:**
- `(course_id, name)` — branch names unique per course
- `(course_id, code)` — branch codes unique per course

---

### `academic_years`

Institutional calendar sessions (not program year).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PRIMARY KEY, AUTO_INCREMENT | Unique identifier |
| `year_label` | VARCHAR(20) | NOT NULL, UNIQUE | Session label (e.g. `2024`, `2024-2025`) |
| `start_date` | DATE | NULL | Session start date |
| `end_date` | DATE | NULL | Session end date |
| `is_active` | BOOLEAN | DEFAULT TRUE | Whether session is active |
| `is_frozen` | BOOLEAN | DEFAULT FALSE | Whether edits are locked |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | |

---

### `branch_academic_years`

Junction table linking branches to academic year sessions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `branch_id` | INT | PK, FK → `course_branches(id)`, ON DELETE CASCADE | Branch |
| `academic_year_id` | INT | PK, FK → `academic_years(id)`, ON DELETE CASCADE | Academic session |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |

**Primary key:** `(branch_id, academic_year_id)`

A single branch can be associated with multiple academic year sessions.

---

### `semesters`

Academic calendar rows — semester date ranges scoped by college, course, session, program year, and batch.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PRIMARY KEY, AUTO_INCREMENT | Unique identifier |
| `college_id` | INT | NULL, FK → `colleges(id)` | College scope |
| `course_id` | INT | NOT NULL, FK → `courses(id)` | Course scope |
| `academic_year_id` | INT | NOT NULL, FK → `academic_years(id)` | Calendar session |
| `year_of_study` | TINYINT | NOT NULL | Program year (1, 2, 3, …) |
| `batch` | VARCHAR(20) | NULL | Admission/join year (e.g. `2026`) |
| `semester_number` | TINYINT | NOT NULL | Semester within program year |
| `start_date` | DATE | NULL | Semester start |
| `end_date` | DATE | NULL | Semester end |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | |

**Unique constraint:** `(college_id, course_id, academic_year_id, year_of_study, semester_number)`

---

### `students`

Student records. Linked to colleges, courses, and branches by **name strings**, not foreign keys.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PRIMARY KEY, AUTO_INCREMENT | Unique identifier |
| `admission_number` | VARCHAR(100) | NULL, INDEXED | Admission number |
| `pin_no` | VARCHAR(50) | NULL, INDEXED | PIN/roll number |
| `college` | VARCHAR(255) | NULL, INDEXED | College name (matches `colleges.name`) |
| `batch` | VARCHAR(50) | NULL, INDEXED | Admission year (e.g. `2026`) |
| `course` | VARCHAR(100) | NULL, INDEXED | Course name (matches `courses.name`) |
| `branch` | VARCHAR(100) | NULL, INDEXED | Branch name (matches `course_branches.name`) |
| `section` | VARCHAR(100) | NULL | Assigned section (e.g. A, B) |
| `current_year` | TINYINT | DEFAULT 1 | Current program year |
| `current_semester` | TINYINT | DEFAULT 1 | Current semester within program year |
| `student_name` | VARCHAR(255) | NOT NULL | Full name |
| `student_status` | VARCHAR(50) | NULL | Status |
| `gender` | ENUM | `M`, `F`, `Other` | Gender |
| `custom_fields` | JSON | NULL | Dynamic form fields |
| `student_data` | LONGTEXT | NULL | Extended student data |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | |

---

### `student_sections`

Per-student section assignment, scoped by branch and batch.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PRIMARY KEY, AUTO_INCREMENT | Unique identifier |
| `student_id` | INT | NOT NULL, UNIQUE, FK → `students(id)` | One section per student |
| `branch_id` | INT | NOT NULL, FK → `course_branches(id)` | Branch scope |
| `batch` | VARCHAR(32) | NOT NULL, DEFAULT '' | Admission batch |
| `section_name` | VARCHAR(64) | NOT NULL | Section label (e.g. A, B) |
| `is_manual` | TINYINT(1) | DEFAULT 0 | 0 = auto-assigned, 1 = manual |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |
| `updated_at` | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | |

**Indexes:**
- `(branch_id, batch, section_name)`
- `(branch_id, batch)`

---

## Junction & Supporting Tables

### `branch_semester_subjects`

Maps subjects to a branch for a specific program year and semester.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PRIMARY KEY, AUTO_INCREMENT | |
| `branch_id` | INT | NOT NULL, FK → `course_branches(id)` | Branch |
| `year_of_study` | TINYINT | NOT NULL | Program year |
| `semester_number` | TINYINT | NOT NULL | Semester number |
| `subject_id` | INT | NOT NULL, FK → `subjects(id)` | Subject |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |

**Unique constraint:** `(branch_id, year_of_study, semester_number, subject_id)`

---

### `branch_hod_year_assignments`

Assigns HOD users to specific program years within a branch.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PRIMARY KEY, AUTO_INCREMENT | |
| `branch_id` | INT | NOT NULL, FK → `course_branches(id)` | Branch |
| `rbac_user_id` | INT | NOT NULL | HOD user |
| `years` | JSON | NOT NULL | Array of program years (e.g. `[1]` or `[2,3,4]`) |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |

**Unique constraint:** `(branch_id, rbac_user_id)`

---

## Metadata Structures (stored in `course_branches.metadata`)

### Sections configuration

Sections are **not a separate table**. They are defined in branch metadata:

```json
{
  "sections": {
    "enabled": true,
    "sortOrder": "pin_then_roll",
    "items": [
      { "name": "A", "strength": 60 },
      { "name": "B", "strength": 60 }
    ]
  }
}
```

| Field | Description |
|-------|-------------|
| `enabled` | Whether sections are used for this branch |
| `sortOrder` | How students are distributed (e.g. by PIN then roll) |
| `items[].name` | Section label |
| `items[].strength` | Maximum students per section |

**Assignment flow:**

```
course_branches.metadata.sections  →  defines available sections
student_sections                   →  assigns student to section per branch + batch
students.section                   →  denormalized section value on student row
```

---

### Additional year configuration

Additional years are **not a separate table**. They are optional branch metadata:

```json
{
  "hasAdditionalYear": true,
  "additionalYear": 5,
  "additionalYearSemesters": 2
}
```

| Field | Description |
|-------|-------------|
| `hasAdditionalYear` | Whether an extra program year exists beyond regular duration |
| `additionalYear` | Program year number (e.g. 5) |
| `additionalYearSemesters` | Number of semesters in the additional year |

Used when a program has a standard duration (e.g. 4 years) plus an optional continuation year.

---

## Batches

There is **no `batches` table**. "Batch" is used in three ways:

### 1. Student admission batch (primary meaning)

The year students joined the program.

| Table | Column | Example |
|-------|--------|---------|
| `students` | `batch` | `2026` |
| `semesters` | `batch` | `2026` |
| `student_sections` | `batch` | `2026` |

Stored as VARCHAR — **not a foreign key**.

### 2. Branch ↔ academic year association

`branch_academic_years` links a branch to one or more `academic_years` sessions. In the application UI these associations are sometimes referred to as batches.

### 3. Frozen batches (settings)

The `settings` table stores a `frozen_batches` key (JSON) to lock edits for specific student batches.

---

## Batch ↔ Program Year ↔ Academic Session

**Forward (batch + program year → session):**

```
academic_session = (batch + year_of_study - 1) – (batch + year_of_study)

Example: batch = 2026, year_of_study = 2  →  session = 2027-2028
```

**Reverse (session + program year → batch):**

```
batch = academic_session_start_year - year_of_study + 1

Example: session = 2027-2028, year_of_study = 2  →  batch = 2026
```

---

## "Years" — Four Concepts

| Concept | Storage | Meaning | Example |
|---------|---------|---------|---------|
| **Program year** | `students.current_year`, `semesters.year_of_study` | Which year of the degree | Year 2 |
| **Academic session** | `academic_years.year_label` | Institutional calendar period | `2024-2025` |
| **Program duration** | `courses.total_years`, `course_branches.total_years` | Total years in the program | 4-year B.Tech |
| **Per-year sem config** | `year_semester_config` JSON | Different sem counts per program year | Y1=1 sem, Y2–4=2 sems |
| **Additional year** | `course_branches.metadata` | Optional extra program year | Year 5 |

**Effective duration resolution order:**

1. `course_branches.year_semester_config` array length
2. If `hasAdditionalYear`: `max(branch.total_years, additionalYear)`
3. `course_branches.total_years`
4. `courses.year_semester_config` array length
5. `courses.total_years`
6. Default: 4

---

## Complete Hierarchy Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         COLLEGE                                  │
│  colleges (id, name, code)                                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ college_id
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                          COURSE                                  │
│  courses (id, name, total_years, year_semester_config)           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ course_id
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                          BRANCH                                  │
│  course_branches (id, name, metadata)                            │
│    metadata:                                                     │
│      • sections { enabled, items[] }                             │
│      • hasAdditionalYear, additionalYear, additionalYearSemesters│
└──────┬──────────────────┬──────────────────┬────────────────────┘
       │                  │                  │
       ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐
│ branch_      │  │ branch_      │  │ student_sections           │
│ academic_    │  │ semester_    │  │ (student_id, branch_id,    │
│ years        │  │ subjects     │  │  batch, section_name)      │
└──────┬───────┘  └──────────────┘  └──────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ACADEMIC YEAR                                │
│  academic_years (id, year_label)                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │ academic_year_id
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SEMESTERS                                 │
│  semesters (college_id, course_id, academic_year_id,            │
│             year_of_study, batch, semester_number,               │
│             start_date, end_date)                                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         STUDENT                                  │
│  students (college, course, branch, batch, section,              │
│            current_year, current_semester)                       │
│  Linked by name strings — not foreign keys                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Example: End-to-End Path

**Pydah College of Engineering → B.Tech → CSE → Batch 2026 → Year 2 → Sem 1 → Section A**

| Layer | Table | Key values |
|-------|-------|------------|
| College | `colleges` | `name = 'Pydah College of Engineering'`, `code = 'PCE'` |
| Course | `courses` | `name = 'B.Tech'`, `college_id = PCE.id`, `total_years = 4` |
| Branch | `course_branches` | `name = 'CSE'`, `course_id = B.Tech.id` |
| Batch | `students` | `batch = '2026'` |
| Program year | `students` | `current_year = 2` |
| Semester | `students` | `current_semester = 1` |
| Academic session | `semesters` | `academic_year_id` → `2027-2028`, `year_of_study = 2`, `batch = '2026'` |
| Section config | `course_branches.metadata` | `sections.items = [{ name: 'A', strength: 60 }, ...]` |
| Section assignment | `student_sections` | `branch_id = CSE.id`, `batch = '2026'`, `section_name = 'A'` |

---

## Key Design Notes

1. **Organizational hierarchy** uses foreign keys: College → Course → Branch.
2. **Batches** are VARCHAR strings, not a dedicated table or FK.
3. **Semesters** are calendar records combining college, course, academic session, program year, batch, and semester number.
4. **Sections** are branch metadata plus `student_sections` assignments.
5. **Additional years** are optional branch metadata for programs with an extra continuation year.
6. **Students** link to config tables by matching `college`, `course`, and `branch` name strings at runtime.
7. **Academic year** (session) and **program year** (year of study) are distinct concepts.

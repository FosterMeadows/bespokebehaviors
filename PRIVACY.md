# Privacy North Star

This system stores only the limited operational records needed for authorized school staff to coordinate make-up work and low-level reteaches.

It is not a gradebook, IEP tracker, counseling record system, formal discipline system, or WVEIS replacement.

The app should help staff answer two questions:

1. Who needs to finish what?
2. Who has received low-level reteaches, and has the student reached the WVEIS threshold?

Access should be grade-scoped by default. Staff may only view active students in their assigned grade level unless they have an approved schoolwide role such as admin, MTSS lead, or owner.

The system must not store grades, IEP information, counseling notes, formal discipline records, sensitive student narratives, or WVEIS details.

## Teacher-Facing Notice

Use this short notice on the login or module selection page:

> This tool is for limited grade-level coordination of make-up work and low-level reteaches. Do not enter grades, IEP information, counseling notes, formal discipline records, sensitive narratives, or WVEIS details.

## Design Rules

- Keep records operational and minimal.
- Prefer structured fields over open-ended narrative fields.
- Store threshold flags and counts, not WVEIS details.
- Store student-linked intervention events only when they are needed for coordination.
- Hide nonessential student history from ordinary users by default.
- Enforce access in both the UI and Firestore security rules.
- Treat schoolwide access as an approved exception, not the default.
- Avoid adding fields that turn the app into a gradebook, discipline record system, counseling record system, IEP tracker, or student information system.

## Access Model

- Grade-level staff can view active students in their assigned grade level.
- Academic staff can view and manage academic intervention records within their permitted scope.
- Behavior staff can view and manage low-level behavior reteach records within their permitted scope.
- Schoolwide roles such as admin, MTSS lead, or owner can access broader views when approved by school policy.
- Student-level combined history may exist for authorized roles, but ordinary users should only see the information needed for their current workflow.

## Data Boundaries

Allowed examples:

- Student name, grade level, homeroom, and active/archive status.
- Academic task title or make-up work identifier.
- Low-level reteach occurrence.
- Served/not served status.
- Date served.
- Staff member who created or updated a record.
- Threshold count or threshold-reached flag.

Not allowed:

- Grades or gradebook-style scores.
- IEP, 504, disability, accommodation, or special education notes.
- Counseling notes or mental health details.
- Formal discipline narratives or official discipline codes.
- Sensitive student narratives.
- WVEIS details, codes, or replacement records.

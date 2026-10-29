# Employee skills and engagement participation

Skills and engagements are reusable masters. Employee skills and engagement participation
are separate records. Engagement participation does not represent an employment
contract or team membership.

## Engagement naming and upgrade

The Business Management resource is **Engagements** in English and **案件** in
Japanese. Its page is `/engagements`, REST resource `/v1/engagements`, search routes
`/v1/engagement-searches` and `/v1/engagement-search-fields`. The previous
`/projects` engagement routes are removed; those paths now belong to the separate
General-group [Projects](Projects.md) module and never alias Engagements.
Employee `/participations` routes retain their
names, but their JSON uses `engagementId` and `engagement`; the old `projectId`
input is rejected, including when a valid `engagementId` is also supplied.

Consolidated migration m0037 renames Project/ProjectParticipation to
Engagement/EngagementParticipation, `projects`/`project_participations` to
`engagements`/`engagement_participations`, and `project_id` to `engagement_id`.
Attached constraints, indexes, triggers and sequences follow the same terminology.
IDs, existing codes, dates, deletion states and sequence positions are retained;
new codes use `ENG-`. The database name and connection configuration stay the same.

Operation codes become `engagements.read/create/update/delete`. Permission IDs,
UUIDs, grants/scopes, deleted states and timestamps are retained. Session
capabilities expose `canReadEngagements`. Saved-filter targets become `engagements`
with their IDs, definitions, names, revisions and timestamps retained. Existing
per-user search tabs, collapse/category/selection settings and page-size settings
are transferred in browser storage before the new search mounts. Existing new
settings take precedence, and other employees' preferences are untouched.

Historical audit and change-history rows retain their original resource/field
identifiers and contents. The new engagement history route also reads legacy
`projects` rows; participation history renders both legacy `project` and current
`engagement` field labels. New records use the new identifiers. Fixed migration
history and existing backups are preserved. Restore an older full backup together
with its matching application/schema, then apply the upgrade; the active-data
backup tools require a matching current schema and stop on an unknown structure.
Active-data exports also retain the engagement/team business-code sequence
positions, so allocation after restore continues beyond the exported codes.

This rename reserves project terminology for a separately planned feature.

## Clients and engagement contracts

`/clients` is a shared Business Management list. `/v1/clients` supports GET/POST,
`/v1/clients/{id}` supports GET/PATCH/DELETE, and client/engagement details use
`/v1/clients/{id}/history` and `/v1/engagements/{id}/history` (GET). History requires
the corresponding resource's read operation, independent of masters.read.

Clients accept name, country/address, two phone numbers,
two fax numbers and notes. Manager, deputy manager, display order and phone/fax
purpose fields and opening/closing dates are excluded from forms, API input/output and the client table;
supplying a removed field returns 422. Legacy history retains its audit records
but removed fields are hidden in the client history display. Clients additionally
accept companyName (required, 128 characters),
contactName/contactDepartment (optional, 128), contactEmail (254), and
contactMobile (32). Name is a unique retained natural key; company names need not
be unique. Country/postal/phone/date validation follows branches. Client forms
reuse authenticated `/v1/postal-addresses` lookups with country-specific examples,
user-selected suggestions, manual correction and provider attribution.
Closing a client does not delete it. DELETE is logical and rejects active engagement
references (409); names remain reserved after deletion.

Client lists accept search over name, company, contact, city and notes. Sorting
allows name, companyName, contactName, contactDepartment, contactEmail,
contactMobile, createdAt and updatedAt, with the common pagination.

Engagement POST/PATCH requires an active clientId and contractStartsOn (YYYY-MM-DD).
contractEndsOn is optional and cannot precede contractStartsOn. These contract
dates are separate from each employee's participation dates; no automatic
participation restriction is introduced. Engagement responses include client name
and company, while internal engagement codes remain omitted. Consolidated m0031
creates engagements with their final contract columns and code defaults. Legacy
engagements with null client/start/end require completion on the next edit.
Database constraints require a paired client/start
and a valid contract period. No client or contract date is fabricated for old data.

Clients use independent clients.read/create/update/delete operations. All five
initial roles receive global read; only system/business administrators receive
global writes. The migration also grants read to existing custom roles. New
custom roles use their explicitly selected DB grants. Own-branch client grants
never authorize global writes. The branch administrator's global read follows
the existing approved shared-master mechanism and requires an active DB grant.
Changes and audit entries are stored in the same serializable transaction as
the mutation. Engagement history snapshots store client names and date-only strings.

## Input and period rules

- Skill names are 1–128 characters, with optional category (128 characters) and
  description (5,000 characters). Leading/trailing whitespace and letter case do
  not distinguish names. Names remain reserved after logical deletion.
- Engagement codes are internal identifiers allocated by PostgreSQL (`ENG-1`,
  `ENG-2`, …). Pre-migration `PRJ-` codes remain unchanged and reserved after logical deletion.
  Codes cannot be supplied on POST/PATCH and are omitted from engagement/participation REST responses,
  forms, lists, details and participation history. Sequence gaps are allowed.
  Engagements are selected and displayed by name. Names need not be unique.
- Employees can have multiple skills, with one active record per skill.
  Proficiency is 1 (needs guidance), 2 (works independently), or 3 (can guide
  others). Experience is optional, 0–80 years in 0.1-year increments.
- Participation has a required start date, optional end date and responsibility
  (5,000 characters). Both dates are inclusive. End cannot precede start; an empty
  end date means undecided.
- Different engagements may overlap. Periods for the same employee and engagement cannot
  overlap, including a shared boundary date. Re-entry creates a separate record;
  employee/engagement/start-date remains unique even after logical deletion.
- Status uses the business date in Asia/Tokyo: planned before start, active from
  start through end, ended after end. An undecided end remains active after start.
- Deleting a master referenced by active records of an active employee is rejected.
  Records use logical deletion. History includes the acting employee and
  human-readable before/after snapshots.

## REST resources

Responses use the common JSON envelope with matching HTTP responseCode. Lists
support offset, limit (1–500, default 100), sortBy, and sortOrder. Invalid input
returns 422; duplicates, period overlap and in-use masters return 409.

| Resource | Methods | List sorting |
| --- | --- | --- |
| /v1/skills | GET, POST | name, category, description, createdAt, updatedAt |
| /v1/skills/{id} | GET, PATCH, DELETE | — |
| /v1/engagements | GET, POST | name, description, contractStartsOn, contractEndsOn, createdAt, updatedAt |
| /v1/engagements/{id} | GET, PATCH, DELETE | — |
| /v1/employees/{id}/skills | GET, POST | proficiency, experienceYears, createdAt, updatedAt |
| /v1/employees/{id}/skills/{recordId} | PATCH, DELETE | — |
| /v1/employees/{id}/participations | GET, POST | startsOn, endsOn, createdAt, updatedAt |
| /v1/employees/{id}/participations/{recordId} | PATCH, DELETE | — |
| /v1/employees/{id}/workforce-history | GET | createdAt |

Master lists accept search. Employee skill writes use skillId, proficiency,
experienceYears, notes; participation writes use engagementId, startsOn, endsOn,
responsibility. PATCH supplies the full editable record; its referenced skill or
engagement cannot change. Create a new record to choose another master. Employee
record list metadata includes target-specific editable flags for create/update/delete.

The employee list adds:

| Query | Values |
| --- | --- |
| skillIds | Distinct positive IDs, comma-separated, at most 100 |
| skillMode | all (default) or any |
| minProficiency | 1–3, requires skillIds, default 1 |
| participationStatus | planned, active, ended, none; omitted means all |
| endingWithinDays | 1–3650; active periods ending from today through that many days |

Filters combine with existing search, branch/team filters, sorting and paging.
The none status means no participation records of any date that have not been
logically deleted. Ending-soon excludes undecided end dates and can combine only
with active status or an omitted status.

## Permissions and initial roles

Masters use independent skills.read/create/update/delete and
engagements.read/create/update/delete permissions. Employee writes use
employees.skills.create/update/delete and employees.participations.create/update/delete.
Record/history reading follows employees.read and its branch scope.

| Initial role | Master read | Master writes | Employee writes |
| --- | --- | --- | --- |
| System / business / server administrator | Global | Global | Global |
| Branch administrator | Global | Denied | Own branch |
| General user | Global | Denied | Denied |

DB grants remain authoritative. Custom roles receive no new grants automatically.
Own-branch master writes are unsupported because masters have no branch owner.
Profile editing does not accept workforce fields. Authentication and operation
and target scope checks run on the API server before business mutations.

The initial release includes no employee self-declaration, approval workflow,
staffing suggestions, allocation, or automated notifications.

## Optional installer examples

Both languages include 24 skills, 12 engagements, six clients and six teams.
Among 360 sample employees, 216 active employees have three skills each (648
records). Every skill has 27 assignments: nine at each proficiency level. Each
employee has one skill at each of the three levels. Experience examples use
0.5, 1.5 and 2.5 years. Selection and rotation are deterministic.

Of the skilled employees, 108 participate in engagements. In catalog order, engagement
sizes are 18, 4, 12, 2, 15, 7, 20, 3, 9, 1, 11 and 6 people, with
36 ended, 36 active and 36 planned examples. Past participation starts after
the employee's hire date and engagement contract start; dated ends fit the contract.
Responsibilities identify the employee's sample skills. Workforce history and
sample-import audit records accompany every skill and participation.

The real initial administrator, retired employees and logically deleted employees
receive no assignments. Teams remain unassigned. All records share the installer's
transaction and empty-database/rerun guards. Choosing no optional samples creates
neither these masters nor workforce assignments. Existing installations are not
populated by this change.

# Projects

## Member search

The Members page uses the shared employee-style search card with Simple search,
Advanced search and Saved filters. Switch between Current members and Employees
to add; the project always remains the server-enforced boundary. Search supports
employee code, first/last name, full names with or without spaces, branch,
employment type, group, department and position. Pagination is independent of the
complete project membership configuration.

Active and unprovisioned non-retired, non-deleted employees can join as editors or
viewers and be assigned tickets. Suspended accounts are excluded from candidates.
Membership does not provision login credentials or roles. Managers still require
an active account and the existing management operations; notifications retain
their active-account recipient checks. Already-registered members remain visible
for membership maintenance, including when their account has been suspended.

`GET /v1/project-member-search-fields` and `POST /v1/project-member-searches` use
`projectId` and `view=members|candidates`. They return only minimal employee identity
labels, never HR profiles. The candidate view requires the existing member-management
operation and project-manager role; viewing members requires project access.
Saved filters use the separate `projectMembers` target and the common condition
schema. Baseline m0046 creates the saved-filter target check with this target
included; no intermediate widening or existing-filter rewrite is performed. The older directory API
also supports unprovisioned employees and full-name matching.

## Project-specific custom fields

Project managers with `projects.settings.manage` define ticket fields in
**Project > Settings > Custom fields**. Fields start empty; names and choices
are user-defined. Supported formats are single select, multiple select, integer,
decimal, time, single-line text, multi-line text, date and checkbox. Definitions
include description, required/optional, default value, order, active state and
all/specific ticket types. Numeric bounds and text length limits are optional.
Time fields accept hours to two decimal places and do not change standard time totals.

The shared ticket creation/edit form and Overview tab use these definitions.
Defaults apply only to new tickets. Required fields are checked on ticket saves,
including existing tickets, but do not block comments or time entries. Values of
inactive fields, inactive options and inapplicable ticket types are retained;
Overview exposes inactive/inapplicable values in a collapsed section. Inactive
options cannot be newly selected. Formats are immutable after creation; fields
and options are deactivated instead of removed. Renaming preserves their IDs.

`GET /v1/projects/{id}/custom-fields` reads definitions; `PUT` saves `{revision,
fields}` and returns the refreshed project. Existing definition/option IDs must be
retained, and negative temporary IDs identify new draft rows. `fields` includes
name, kind, description, required, enabled, defaultValue, min, max, maxLength,
typeIds and options. Array order determines display order; empty typeIds means all.
Ticket APIs add `customFields`, an object keyed by numeric field ID. Values are
strings, numbers, booleans, option IDs, option-ID arrays, or null. Omitted update
keys retain their values; explicit null clears applicable fields. All validation,
project membership, operations, archived-state and revision checks run in the API.
Changes are recorded in project/ticket history.

Personal display columns accept `custom.{fieldId}`. Search metadata supplies
authorized fields and option labels to project and cross-project lists, Ticket
panels and Gantt. Cross-project labels include project and field names; equal names
never merge identities. Numeric/date comparisons, text matching, selection and
unset predicates use the existing AND/OR and saved-filter contracts. Multiple
selections support `in` (any), `allIn` (all) and `notIn` (none). Inapplicable
tickets never match custom predicates, including unset and negative predicates.
Unavailable fields/options make a saved condition invalid rather than silently
discarding it. Custom fields do not add sorting, rollups or shared global masters.

Baseline **m0046** creates the five custom-field tables in their final form.
It replaces the complete historical chain for fresh installations; it is not
an additive custom-field migration for an existing database. Older histories
must not replay the baseline or rewrite historical checksums.

## Ticket hierarchy search

Simple search offers Parent ticket and Child tickets,
each with Any, None and Present. Advanced search exposes
the same fields in Basic information; both views share conditions and saved filters.
The filters apply to global and project ticket lists, Ticket panels and Gantt views.

Only direct, non-deleted parents and children in the same project count. Other
search conditions, status and pagination do not change whether a related ticket
exists; grandchildren do not count as direct children. An old reference to a
deleted parent is treated as no parent. Existing project visibility remains in force.

The existing `GET /v1/project-ticket-search-fields` metadata and
`POST /v1/project-ticket-searches` condition schema support the additive choice
fields `parentPresence` and `childPresence`, with values `absent` and `present`.
Any omits that field's condition. Existing definitions, operators, saved filters,
AND/OR logic and pagination keep their current contracts. The simple controls
preserve complex saved conditions and indicate when additional conditions apply.

Project ticket creation is available from the Tickets card header next to Display
columns, using the same plus button as the cross-project ticket list. The project
workspace toolbar has no creation button. The project card opens its own project
directly and restores focus to its plus button when the ticket dialog closes.
Existing creation permissions and the archived-project restriction are retained.
Both project and cross-project Ticket panel cards also place the shared plus
button at the top right. Project panels open their project directly; cross-project
panels first select a project. Saving refreshes the panel and opens the ticket,
and closing restores focus to the plus button.

## Project settings

Types, Statuses and Custom fields use the common plus icon at the right edge of
each card heading. Supplementary instructions open from the heading information
icon; the custom-field editor uses the same information popover. The Danger zone
has the same full-width heading divider as the other settings cards and a subtle
rose-tinted background adjusted for light and dark themes.

Name, Visibility, Engagement and Status are edited in the Settings tab's Basic
information card. Existing projects have no Edit project button or edit modal;
the creation modal remains available in the project catalogue. Description editing
stays inline in Overview. Basic fields use compact widths and wrap as space
requires; all four fit in one row on a wide desktop, with full-width fields on phones.

Basic information uses the existing project update operation and manager check.
Types, Statuses and Statuses by type retain the settings management operation;
each card saves and discards independently, retains other cards' drafts and shares
the latest project revision. Unsaved basic information also triggers navigation
confirmation and disables Danger zone deletion. An unavailable engagement remains
selected; unrelated saves do not clear its association. Without engagement read
access, that selector is disabled. API contracts and server authorization remain
unchanged.

## Markdown text

Project descriptions, ticket descriptions and comments support Markdown, including
existing text. Source is retained verbatim, without converting saved text to HTML.
Desktop and mobile editing use the common Input/Preview tabs. Each panel fills
the editor width, with formatting tools below the Input tab and no redundant
visible field or preview labels. The text area retains its accessible label. Native text editing, IME and undo remain available.
Formatting tools use compact icons with localized accessible labels and hover
titles, including tables, bulleted/numbered lists, checklists and strikethrough.
Selected lines can be converted to lists. The Overview description has its own edit icon and expands into a full-
width inline editor. Save changes only the description using the original project
revision; failures preserve the draft. Cancel and navigation confirm unsaved edits.

Overview shows Progress, Time (hours), Visibility and Status as four equal compact
summary cards (four columns on desktop, two on narrow screens). Progress/time
calculation notes open from the common information popovers. The description is
placed below the summary and uses the entire content width.

Code fences show a language label and Copy control, preserve whitespace, use system
monospace fonts, and scroll long lines within their own frame. No line numbers are
shown. Typing an opening triple-backtick fence opens a searchable language chooser;
closing fences and inline code do not. Exact language/alias matches rank first.
The approved Highlight.js 11.12.0 subset includes 193 definitions (including plain
text) and 187 aliases. Grammars load as needed in a Worker; timeout, failure or an
unknown language leaves the source readable. Escaped tokens are rendered as text,
never injected HTML. Code fences retain their source.

A fence may specify `language:title`, for example `SQL:Daily query`. The header
shows `SQL : Daily query`; highlighting uses only the language, case-insensitively
with the existing aliases. Spaces around the delimiter/title are trimmed, while
spaces and additional colons inside the title are retained. An empty title keeps
the ordinary language-only header. Use `text:title` for a plain-text block.
Titles are literal escaped text, without Markdown/HTML or project-reference
linking. Long titles wrap beside the copy icon. This applies to project/ticket
descriptions and comments, including editor previews and saved content. Copy
writes only the unchanged code body, without the language or title. The editor's
language chooser and the stored Markdown source remain unchanged.


Project and ticket IDs in ordinary text are resolved through
`POST /v1/project-reference-resolutions` in batches of at most 500. Only existing,
active and currently accessible records become links. Project links open Overview;
ticket links open the shared ticket detail. Code, existing links and image
destinations are excluded. Resolution failure leaves the text intact and
never reveals inaccessible record names or existence.

PNG, JPEG and static WebP can be selected, pasted or dropped into the editor.
Images are API-owned PostgreSQL records, not public files. Limits are 10 MiB/image,
20 images and 50 MiB per text, plus the same total limit for each uploader's pending
drafts. The existing bounded image validators are reused. External image URLs are
shown as links, without fetching them automatically. Raw HTML is displayed as text;
unsafe link schemes are disabled.

`POST /v1/project-markdown-images` creates an authenticated private draft for the
specified project/ticket/comment editing context. Its identifier is a non-secret
image record key, represented in source as `sph-image:<key>`. GET/DELETE on
`/v1/project-markdown-images/{key}` recheck operations and ownership/resource access.
GET returns bounded base64 image data in the standard JSON envelope. Body saves
validate and bind referenced drafts in the same transaction. Other people's drafts
and other body targets cannot be attached. Cancelling an editor cleans up its own
unbound drafts by logical deletion; saved images remain available for retained
history. A project/ticket/comment deletion makes its bound images unavailable.

Fresh-install baseline **m0046** creates image storage and retains separate image/read/create/delete
operation codes. Existing active global read/attachment grants
receive their corresponding new operations; scoped and revoked grants are not
expanded. The existing body operation and project membership remain mandatory.
New installs use the current default-role catalog. Local installations with
legacy migration histories require a separately approved, backed-up transition;
never replay consolidated migrations or rewrite their history as part of this feature.

Ticket details share one retained-tab modal across the ticket list, ticket panel and Gantt.
The initial Overview tab contains custom fields, basic information, dates/time
and description/labels using the common detail cards. A separate Child tickets
tab follows Overview, before Comments, Checklist, Time, Files and Relations.
Child tickets is available even when empty and retains its list state across tab
switches. Its card loads direct, active
children through the paginated project ticket REST endpoint with `parentId`,
independently of the surrounding list's filters and page. Rows show Ticket ID,
title, status and assignee, and open the selected child's detail.
The common Add child ticket button is available with the existing creation
operation and an editable project role, except in archived projects. It opens
the ordinary creation form with the current project and parent fixed. Other
fields use new-ticket defaults; dates, assignee, description and labels are not
inherited. Save refreshes the parent's child list; cancel returns to the parent.
The parent dialog remains mounted, preserving its tab, scroll and unsent comment.
Opening a child detail asks before discarding a parent comment draft, then opens
a nested detail modal while retaining the parent's DOM, selected tab, child-list
page and scroll position. The root ticket URL stays anchored to the original
parent. Header close, footer Close and Escape close only the current level and
restore focus to the originating child row. Grandchildren use the same behavior.
Updates or deletion in a nested detail refresh the retained parent and its child
list through the existing REST endpoints. A failed load leaves the parent open.
The same flow is used by cross-project and project ticket lists, panels, Gantt
views and history links. Existing server-side membership, creation, same-project
and maximum-depth checks remain authoritative; failures keep the child draft.
Edit and delete actions use the common header icon controls; the detail footer contains Close only. The header star icon toggles the current user's watch state using the existing
watchers API; outline star/plus means Watch and filled star/minus means Stop watching. All header glyphs are 18px; the accessible name and `aria-pressed` expose the current state.
Tabbed dialogs reserve the largest natural panel height from first display,
capped by the viewport, and scroll only their body. Switching tabs preserves
the dialog position, dimensions and retained input state.

Project deletion is available only in the Danger zone at the bottom of project
Settings; Overview has no project delete icon. The red Delete project button is
disabled until the entered Project ID exactly matches the immutable project code
(case and whitespace included). Clearing or changing the input disables it again.
Unsaved settings and in-flight deletion also disable it. The settings link is
available to project managers with settings or deletion operations; each section
requires its own existing operation. Final confirmation states that all information
belonging to the project will be deleted. Cancelling sends no delete request;
the existing API authorization and logical-deletion behavior remain in force.

Projects is internal work management, separate from client **Engagements**.
The Projects sidebar group sits between General and Business Management.
`/projects` opens the project catalogue; `/projects/tickets`, `/projects/ticket-panel`
and `/projects/gantt` open cross-project work views without a project selection step.
The former `/projects/board` and `/projects/{projectCode}/board` URLs are removed
and return 404, without redirects. The current view name is Ticket panel. Project-specific views use `/projects/{projectCode}/ticket-panel`.
Ticket panel project headings collapse or expand their own tickets, like Gantt project groups.
Ticket panel and Gantt automatically display all matching tickets without a Load more control.
This is a presentation rename: shared project/ticket tables, REST APIs, permissions
and saved ticket-search state remain unchanged.
Existing engagement records and grants are not copied into this domain.

## Project and ticket identifiers

User-facing labels consistently use **Project ID** and
**Ticket ID**. These labels refer to the existing `Project.code` and
`ProjectTicket.code` business identifiers. Numeric surrogate `id` fields, API
property names, validation codes and stored values are unchanged.

Project and ticket creation forms show localized input examples in empty text,
number and description controls. Examples never become submitted values. Project
code/name and visibility/related engagement share two equal columns on desktop;
descriptions keep the full width. Ticket title/priority, type/status,
assignee/parent, dates and estimate/order are paired, with full-width description
and a half-width labels field. Compact/phone layouts use a single column.
Supplementary rules appear in the existing click-to-open information popover to
the right of the field label, including code rules, visibility, engagement,
estimate, order and comma-separated labels. Escape closes the help while keeping
the form open.

The cross-project `/projects/tickets` card header has the common plus button when
the session permits `projects.tickets.create`. It opens a project picker followed
by the shared ticket form. Project candidates use the existing paginated REST
list and can be loaded further; archived candidates and unsupported legacy codes are excluded. A selected
project's current detail/operations and membership are checked before proceeding.
Read-only/viewer projects cannot proceed. This presentation check does not replace
the existing server-side creation guard. After saving, the list refreshes and
opens the new ticket detail using its code URL. Embedded project lists retain
their own Tickets card-header plus button, without a duplicate workspace-toolbar action.

New projects require `code`: trim whitespace, uppercase ASCII lowercase letters,
then validate `^[A-Z][A-Z0-9_]{0,63}$`. Hyphens and non-ASCII input are rejected.
Codes are unique across active and deleted projects, cannot be changed, and are
never reused. The creation form shows the rule; existing project settings do not permit code changes.
Missing/invalid codes and attempted code changes return 422; duplicates return 409.

Ticket `code` is generated by the API from the immutable project code and the
existing project-local number: `DEVELOP_001-0001`. Padding is a minimum of four
digits, so 9999 is followed by 10000 without truncation. Row locking serializes
ticket creation; deleted numbers are never reused. Code sorting compares project
code and then the numeric ticket sequence, including across the 9999 boundary.
The existing integer primary/foreign keys and unique project/number pair remain
internal identifiers. No new database column or migration is required.

All visible identities, parent/relation choices, history, ticket panel/Gantt, notifications
and browser links use codes. The internal REST API still accepts numeric IDs and
also accepts project code and full ticket code path references. Authorization is
checked on the resolved project before reading or modifying ticket data. Advanced
search exposes a string ticket-code field instead of numeric ticket ID/number.

Browser URLs accept project codes and canonical full ticket codes only. Old numeric
URLs and noncanonical ticket references return 404, with no redirects. No legacy
PJT-code compatibility is supplied for browser routing. Existing data with codes
outside the current format needs a separately planned transition. This routing
rule does not authorize reinstallation or deletion of an operational database.

## Navigation, cross-project search and personal columns

The shared search card supports keyword, multiple projects, project status,
assignee, project-specific type/status, status category, priority, start/due dates
and creation/update timestamps. Quick selections and advanced conditions are
combined with AND. Search conditions follow the user between ticket, ticket panel and
Gantt views within the browser session; project catalogue conditions are separate.
Saved ticket filters use the independent `projectTickets` target and existing
private saved-filter permissions. All result counts, options and relations are
filtered by server-side Projects visibility. API results default to 100 per request;
ticket panel/Gantt automatically fetch batches of up to 500 and display the complete
result together. Their requests preserve the saved page size. Ticket lists use the same MasterList card, table/mobile rows, sort
controls, page-size picker and pagination as Projects and Employees (10–50 desktop
rows, 20 on mobile). Their page size is carried in the shared search definition.
Work cards do not repeat ticket/ticket panel/Gantt navigation links; use the sidebar or
individual project's navigation. Card headings share the ListCardTitle component
with the common MasterList.

Ticket panels retain each project's own status columns and do not allow cross-project
dragging. Dropping into the current status performs no request or update. A status
change retains loaded cards and their relative order within each column, appending
the moved card to its destination. This display order lasts until the next search
or page reload and does not write ticket positions. Updated cards that no longer
match the active filters or access permissions disappear from the results.

The API retains compatible `POST /v1/project-ticket-searches` support for
optional request-level `ticketIds` (1–500 distinct positive 32-bit integers).
Existing conditions, project scope and permissions remain mandatory. For this
request, `meta.total` counts the matching requested IDs and `meta.searchTotal`
counts all matches of the original search; ordinary requests are unchanged.
Panel and Gantt refresh the complete search, including newly matching tickets.
Responses are deduplicated by ID and offsets advance by raw response counts.
Changing totals or incomplete results trigger one restart from the beginning;
continued inconsistency displays an error and Retry. A failed refresh retains
the previous result; a new search clears it. Retry does not repeat a saved update.
Panel movements remain disabled until recovery. Superseded searches are cancelled
and cannot replace newer results.

Gantt uses one shared time axis for all loaded results, with collapsible
project groups by default, assignee groups or a flat start-date order. Project
groups retain parent hierarchy. Unassigned and unscheduled tickets stay visible.
Assignee grouping labels NULL assignees as Unassigned. It uses
the returned assignee person before membership fallback; an unavailable person
on an assigned ticket is labelled Assignee unavailable rather than Unassigned.
The Gantt ticket column starts at 260px and can be resized from its right
boundary along its full height with mouse/touch dragging or Left/Right keys (10px, Shift: 50px).
Widths range from 120px to 2000px; Home/End select those bounds and double-click
restores 260px. Escape or pointer cancellation reverts an in-progress drag.
Width persists per employee in the same browser across reloads and global/project
views; no preference API or DB field is added. The visible view name is
Gantt chart; `/gantt` URLs remain unchanged.
Small neutral six-dot grips repeat along a thin neutral rail throughout the drag
area; hover/drag emphasis stays neutral and the 44px hit area remains available.
Pointer completion/cancellation clears the drag focus so grip outlines do not
remain active; keyboard resizing retains a visible focus indication. Header, ticket rows, time axis and dependency lines
stay aligned after resizing. The first time-axis date label is inset past
the grip so its text never overlaps the resize control.
Pointer focus uses `preventScroll` so clicking the full-height boundary does not
move the page or timeline scroll position, including very long result sets.
The Group by selector sits at the right end of the Gantt card title row; its
intrinsic width fits the longest localized choice plus the common control padding.
Its visible label is hidden while the accessible name is retained. On narrow
screens the Group by control stays beside the title and the period form wraps
onto the next row.
To its left, Display period uses the shared start/end DatePickers, Apply and
All dates controls. The DatePickers explicitly use standard density even with
hidden labels, keeping the common body font size on phones instead of the
legacy compact 12px treatment. The automatic initial period covers all loaded ticket dates
(or today in the employee's time zone when none are scheduled). Apply uses both
inclusive dates; invalid/reversed ranges retain the previous chart and cannot be
applied. All dates restores automatic bounds, including later loaded results.
The selected period is local to the view and is independent of API search filters.
Ticket and group rows remain present outside the period, including unscheduled
tickets. Only the selected time span is drawn: bars and their displayed dates are
clipped to its inclusive bounds, dependency paths are clipped to the time area,
and off-period successor arrows are omitted. Ticket details retain actual dates.

Project labels show only the project name, including group headings, warnings and
accessible descriptions; ticket codes retain their existing format.
When grouping by project, the project name appears only in its group heading,
not in every ticket row. Assignee/ungrouped views retain per-row project names.

Existing finish-to-start relationships are drawn when both endpoints are loaded;
date-conflict warnings remain informational. Cross-project relationships are not
introduced.

Project links open `/projects/{code}/overview`. The project navigation links to
`overview`, `tickets`, `ticket-panel`, `gantt`, `history`, `members` and `settings` sibling
pages. Settings visibility follows existing manager/operation checks. Sidebar
work links always open cross-project views. The former `/projects/{code}` page is
removed, without a redirect or compatibility handler. Notifications now resolve
to `/projects/tickets?ticket={ticketCode}` and recheck current project access. Work views
also support `?ticket={ticketCode}` for a detail modal independently of current filters.

Ticket list columns are shared between cross-project and individual project lists.
Project ID, project name, ticket ID and ticket name are independently selectable
and reorderable columns; IDs show the public codes. The defaults are project
name, ticket ID, ticket name, type, status, assignee and due date. Project ID is
hidden by default and after Restore defaults. At least one column must remain.
Assignees show names without employee codes and open the existing employee detail
modal through REST; access failures show an error without opening ticket details.
Project ID/name links use the link color without underlines. Mobile cards obey
the same selected columns and order. Empty optional values are blank throughout
project lists, overview, details, ticket panels and timelines; real zero time values,
empty-result notices, form choices and historical unset markers are preserved.
The Display columns dialog uses the same ON/OFF switches as widget approvals in
System settings. Drag handles reorder all columns, including disabled columns,
with mouse/touch and keyboard support (Space/Enter, arrows, Escape). The last
remaining column cannot be switched off. Changes remain drafts until Save;
Cancel and Restore defaults retain their existing behavior. Saving uses REST and is
independent of searches, so another browser restores the same preferences.
Column width is saved in localStorage per employee and shared by global and
project Gantt views in that browser. Completed pointer and keyboard adjustments
are saved; cancelling a drag restores its starting width without changing the
saved value. Double-click saves the default width. Invalid stored widths fall
back to 260px, and resizing remains available when browser storage is unavailable.

`GET/PUT /v1/personal-settings/project-ticket-columns` reads/writes the session
owner's preferences; PUT additionally requires `projects.preferences.update`
and a matching `x-settings-owner` header. Empty lists and unknown/duplicate IDs
are rejected. Keys `project` and `ticket` identify ID columns; `projectName` and
`title` identify name columns. Existing legacy arrays expand each project/ticket
entry into ID/name pairs in place, preserving their display and order. New saves
use `{schemaVersion:2,columns:[...]}` in the existing JSON field, while GET/PUT
responses retain `{employeeId,columns}`. Unset/invalid stored preferences use the
defaults. No schema migration is required. Existing global Projects reader roles receive the new
personal-preference operation in the current initial role definitions; it grants no project or ticket mutation rights.
Fresh initial roles include it. Baseline m0046 creates the JSON preference column and
expands the saved-filter target constraint. No existing project data migration is
required.

Project catalogue columns are independently stored per employee in
`employee_settings.project_columns` (JSONB, created by baseline m0046).
`GET/PUT /v1/personal-settings/project-columns` returns `{employeeId,columns}`;
PUT accepts `{columns}` and requires `projects.preferences.update` plus the
matching `x-settings-owner` header. GET requires `projects.read`. The five allowed
keys, also the defaults in order, are `code`, `name`, `status`, `visibility` and
`updatedAt`. Empty/duplicate/unknown keys and extra input fields are rejected.
Storage uses `{schemaVersion:1,columns:[...]}`; unset/invalid values use defaults.
The catalogue Display columns dialog follows the ticket dialog controls, draft,
Save, Cancel and Restore defaults behavior, keeping at least one column visible.
Table and mobile rows use the same saved selection/order across browsers.
Catalogue preferences do not change ticket columns, filters, sorting or page size.

## Implemented scope

- Private projects by default; optional internal visibility. Project creation is
  enabled for the five initial employee roles. Custom roles remain explicitly
  configured by the system administrator.
- Project manager/editor/viewer membership is separate from the employee's single
  system role. Public internal readers cannot edit. Only a system administrator
  with `projects.admin` can manage a non-member private project.
- Up to 20 ticket levels, independent of ticket type. Parent changes cannot
  cross projects or introduce a cycle. A parent with active children cannot be
  deleted alone. Ticket numbers are project-local and never reused.
- List, ticket panel and basic Gantt share tickets and workspace filters. The
  project catalogue uses the shared SearchPanel/MasterList and personal saved
  searches. Panel and Gantt automatically fetch all workspace matches in batches
  of up to 500; ticket lists retain pagination and saved page sizes.
- Task, Bug, Story and Milestone types; Open, In progress, In review, Done and
  Cancelled statuses are seeded in the creator's language. Names are editable.
  Milestone behavior is a stored type attribute, independent of its translated
  name; dated milestones occupy one day.
- Comments, explicit employee mentions, checklists, watchers, time entries,
  attachments, history and existing header notifications.

## Statuses by type

Statuses are project-owned definitions with `open`, `active`, `done` or
`cancelled` category. Each type selects an ordered subset and exactly one
unfinished initial status. Initially all four types share the five seeded states.
Managers can then give Bug a different set from Task, for example.

Creation without an explicit status uses that type's initial status. Changing
type preserves the current status only when the destination type allows it;
otherwise the editor requires an explicit replacement. API writes enforce the
same pair validation, including ticket panel moves.

There are no transition-edge restrictions in this delivery: any allowed state
can be selected. Conditions such as “Open cannot go directly to Done” belong to
the subsequent configurable transition stage.

Settings are saved as a complete, revisioned configuration. Existing positive IDs
must belong to the project; negative IDs are temporary references for new draft
definitions. Removing a used type or allowed state requires explicit replacement
mapping. All affected tickets and configuration change in one transaction; no
automatic fallback silently changes a ticket's meaning. Duplicate names or
invalid migrations fail without partially saving.

The settings interface has separate Types, Statuses and Statuses-by-type cards.
Each card owns its Save, Discard, success and error messages. Saving assembles
the existing REST representation from that card's draft and the other cards'
**saved** values, so unrelated unfinished input is never submitted. Other dirty
cards remain mounted and retain their drafts. The API skips unchanged definition
and mapping rows, preserving their update timestamps. Necessary replacements for
deleted definitions are chosen in the owning card and committed atomically.
New types receive the saved status set; new statuses are enabled for types in the
mapping card. Surviving mapping drafts are rebased when saved definitions change.
Definition lists have one visible column label, accessible hidden field labels,
centered milestone checkboxes and shared icon delete controls. Shared six-dot
handles support pointer/touch drag sorting and keyboard pickup/move/drop/cancel;
ticket lists and checklists use the same ordering control.

## Dates, relationships and time

Parent hierarchy and ticket relationships are distinct. Related-to, duplicate,
blocks and finish-to-start relations are available. Directed relations reject
cycles. They do not automatically close other tickets or move dates. The basic
Gantt warns when a finish-to-start successor starts on/before its predecessor's
finish date. Unscheduled tickets remain accessible.

Dates use database DATE fields. Estimated and actual work are entered and displayed
in hours with exactly two decimal places. Inputs accept 0.01-hour increments.
Storage uses NUMERIC(12,2) minutes, representing 0.01 hours exactly as 0.60 minutes;
REST fields `estimatedMinutes`, `actualMinutes` and `minutes` remain JSON numbers
in minutes and accept up to two decimal places. Estimates are non-negative
(maximum 100,000,000 minutes); actual entries are positive and at most 1,440
minutes (24 hours). Existing minute values and history are preserved, including
when an unrelated field is edited. Totals sum unrounded minute values before
rounding the final hours display to two decimals.

Baseline m0046 creates the two minute columns directly as NUMERIC(12,2).
Markdown image references use ON UPDATE CASCADE and ON DELETE RESTRICT from the
start. It does not run intermediate type conversions or rewrite time history.
Existing installations require their matching historical source or a separately
approved transition; do not replay the fresh-install SQL on them.
Actual entries record employee, work date and notes. Entry authors and project
managers can correct entries; all corrections are logged. Overview totals sum
direct entries exactly once. Tree rollups include the displayed subtree and are
separate from each ticket's own work; filtering/loading can limit these displayed
subtree totals. No employee salary, billing rate, or monetary actual cost is
inferred from these time records.

## REST contract and authorization

All browser and SSR access goes through REST and the same-origin gateway.

| Resource | Operations |
| --- | --- |
| `/v1/projects` | GET catalogue, POST project |
| `/v1/projects/{id}` | GET detail, PATCH metadata, DELETE soft deletion |
| `/v1/projects/directory` | GET minimal active employee picker, paginated |
| `/v1/projects/{id}/members/{employeeId}` | PATCH membership/role; `removed` revokes membership |
| `/v1/projects/{id}/settings` | PUT complete type/status configuration |
| `/v1/projects/{id}/history` | GET paginated project history |
| `/v1/projects/{id}/tickets` | GET paginated tickets, POST ticket |
| `/v1/projects/{id}/tickets/{ticketId}` | GET detail, PATCH ticket, DELETE soft deletion |
| ticket subresources | comments, checklists, time-entries, watchers, relations, attachments |
| `/v1/project-searches` | POST shared search definition |
| `/v1/project-search-fields` | GET authorized search definitions |
| `/v1/project-ticket-searches` | POST authorized cross-project ticket search; optional fixed `projectId` query for individual views |
| `/v1/project-ticket-search-fields` | GET authorized ticket search definitions/options |
| `/v1/personal-settings/project-ticket-columns` | GET personal ticket columns, PUT complete ordered selection |
| `/v1/personal-settings/project-columns` | GET personal catalogue columns, PUT complete ordered selection |
| `/v1/project-reference-resolutions` | POST readable project/ticket reference resolution |
| `/v1/project-markdown-images` and `/{key}` | POST private draft image; GET protected JSON image, DELETE own draft under current access checks |

JSON responses include `status` and matching HTTP `responseCode`. File downloads
return a protected binary response. Lists use the common allowlisted sort fields,
offset, and limit 1–500 (default 100). Project search supports the common bounded
condition tree and saved-filter ownership/revision rules.

Every operation requires the corresponding global `projects.*` DB grant plus
the project visibility/member role. Own-branch or legacy engagement grants do
not confer Projects access. Project settings, metadata and membership writes
require manager membership (or the dedicated system-admin capability). Ticket
writes require editor/manager membership. Individual comment/time-entry changes
also enforce ownership unless the caller is a manager. Referenced assignees must
be active editor/manager members. Linked engagement details require their own
source permission. Employee pickers return only identity labels, never HR details.

Mutations lock the project row, then check current membership and revision. Ticket
mutations require the current ticket revision; settings/member/metadata changes
require the project revision. DELETE/upload carry revision in the query, other
writes in JSON. Competing writes return a conflict rather than overwriting edits.
The last active project manager cannot be removed. Archived projects are read
only until a manager explicitly changes project status. Project/ticket soft
deletion retains descendants/evidence but all normal access checks the active
project and ticket. Audit/history remains persisted.

Notifications store typed target IDs rather than private content snapshots.
Recipients are current members; opening/resolving a notice rechecks access.

## Attachments

Supported: PNG, JPEG, static WebP, PDF, DOCX, XLSX, PPTX, UTF-8 TXT/CSV/MD, ZIP.
Legacy Office, macro-enabled Office and encrypted archives are unsupported.
Limits: 10 MiB/file, 20 active files/ticket, 50 MiB total/ticket. ZIP/Office
inspection is bounded to 1,000 entries and 100 MiB expanded content. Both central
directory metadata and streamed lengths/CRC are checked; traversal names,
inconsistent records, corruption and encryption are rejected. Archives are never
extracted to the filesystem, nested archives are not recursively expanded, XML
is not executed, and external relationships are not fetched. OOXML checks verify
the package's main parts and reject macro/ActiveX content. These are structural
checks, not a malware-scanner claim.

Downloads recheck the project/ticket and are attachment-only, with nosniff and
sandbox headers. Upload bytes are stored in API-owned PostgreSQL, not exposed as
public static files. Existing image/PDF validators are reused. API-side
`fflate@0.8.3` is the explicitly approved additional dependency; license text,
provenance and runtime dependency facts are in `licenses/fflate-0.8.3/`.
Its attributed UZIP.js algorithms also retain Photopea's original 2018 MIT grant
in API and browser distributions, with immutable source/digest verification.

## Migration and recovery

The single fresh-install baseline `m0046` creates the complete final Projects
schema, its independent project-code sequence, saved-search targets, Markdown
image storage and final numeric time types. SQL-only checks, indexes, foreign
keys and triggers are preserved from the former chain. Normal installer setup
initializes permissions; the migration does not replay old rename, backfill,
permission-transition or OKR-creation/removal steps.

Old development histories must not replay this baseline or rewrite checksums.
The former narrow application and reconciliation tools are retired. Existing
backups require their matching source revision or a separately approved history
transition; this consolidation changes no operational database.

The active-data recovery exporter retains Projects timestamps and tombstones,
including type/status definitions required by history; it remaps relational and
typed history/notification references and preserves the project-code allocator.
This intentionally retains project evidence beyond the active-only selection
used for ordinary master data. Full private pg_dump backups precede operational
migration. Public deployment is a separate action.

## Research decisions and roadmap

The following are independently implemented design choices informed by official
product documentation. Commercial backend implementations are not public;
published APIs describe contracts rather than proving their internal storage.
Redmine source was inspected for concepts, not copied into SPH.

| Source | Decision and delivery |
| --- | --- |
| [Jira reports](https://support.atlassian.com/jira-software-cloud/docs/generate-a-report/) and [work types](https://support.atlassian.com/jira-cloud-administration/docs/what-are-issue-types) | Keep type, status and work hierarchy separate; later sprint/backlog/releases and scope-change-aware burndown/velocity. |
| [Redmine issues](https://www.redmine.org/projects/redmine/wiki/RedmineIssues), [7.0.2 issue model](https://github.com/redmine/redmine/blob/7.0.2/app/models/issue.rb), [relations](https://github.com/redmine/redmine/blob/7.0.2/app/models/issue_relation.rb) | Current delivery has multi-level tickets, explicit links, cycle validation, time and journals. SPH uses soft deletion and transaction services rather than copying Rails callbacks or cascading deletes. |
| [Asana dependencies](https://help.asana.com/s/article/how-to-use-task-dependencies), [workload](https://help.asana.com/s/article/reporting-with-workload?language=en_US), [goals](https://help.asana.com/s/article/lead-the-goals-management-process-in-your-organization-with-asana-goals) | Shared views now; later four dependency types and resource capacity; outcomes remain separate from task completion. |
| [monday hierarchy API](https://developer.monday.com/api-reference/docs/working-with-multi-level-boards) and [dependency behavior](https://support.monday.com/hc/en-us/articles/360007402599-Dependencies-on-monday-com) | One task model across hierarchy/views; distinguish input from rollup. Later typed custom fields and explicit scheduling modes; no arbitrary eval expressions. |
| [ClickUp Docs](https://help.clickup.com/hc/en-us/articles/6328174371351-Intro-to-Docs) and [time](https://help.clickup.com/hc/en-us/articles/6304291811479-Intro-to-time-tracking) | Time/comments/attachments now; versioned docs/wiki with task relationships later. |
| [Wrike Gantt](https://www.wrike.com/features/gantt-chart/) | Basic dates/dependencies now; later baselines, critical path and change previews. |
| [Trello checklists](https://support.atlassian.com/trello/docs/adding-checklists-to-cards/) and [automation](https://support.atlassian.com/trello/docs/automation-overview/) | Simple ticket panel/checklists now; later declarative triggers/actions with bounded runs, idempotency and audit. |
| [Microsoft Project EVM](https://support.microsoft.com/en-us/project/earned-value-analysis-for-the-rest-of-us) | Keep baseline, status date, progress and actual costs distinct. PV/EV/AC and variances use auditable snapshots; no retrospective inference from current task status. |

When the installer option to add samples is selected on a fresh installation,
three fictional internal projects (`DEVELOP`, `MIGRATION`, and
`WEBSITE`) and 30 tickets are added in the selected language. They include
three-level ticket hierarchies, four types, five statuses, milestones, dependencies,
comments, checklists, and recorded time. Dates are relative to installation day so
the ticket list, ticket panel, and Gantt views can be explored immediately. The initial
administrator is their project manager. Samples are part of the initial-data
transaction; restarting services does not append them, and declining samples
creates no projects or tickets.

All three project descriptions, 30 ticket descriptions and three comments contain
localized Markdown: headings, emphasis, lists, quotes, tables, task checklists and
fenced code blocks with language labels and titles. The development project uses
TypeScript, the migration project uses read-only SQL, and the website project
uses HTML/CSS; JSON records identify each ticket. Project/ticket references and
internal links lead to the installed records. These original fictional examples
are documentation only and are never executed. This changes fresh-install content
only; it does not migrate or reinsert existing project records.

The initial empty-database check also accepts the single pristine invitation
setting created by m0046 (key `main`, validity 30 minutes, no deletion or update).
Modified or logically deleted invitation settings are rejected, as are existing
business records. The initializer does not change the invitation configuration.

Generated names, descriptions, labels, comments, history and identifiers do not
contain the English or Japanese sample marker. Project IDs are DEVELOP, MIGRATION and WEBSITE;
ticket IDs inherit those prefixes. Installer option names remain unchanged.

Subsequent stages, requiring their own detailed implementation plan:

1. Four dependency types, working calendars, preview/confirm scheduling, baselines
   and critical path. Prioritize SPH skill/available-capacity/engagement-period
   recommendations and explainable impacts of staffing changes.
2. Agile backlog/sprints/releases/reports, docs/wiki,
   templates, type-specific transition conditions and declarative automation.
3. Portfolio optimization, equipment/license readiness, accounting/approval
   integration and foreign exchange. Monthly EVM are available
   as described below; these later integrations remain roadmap items.

The roadmap targets tighter integration with employee skills, work calendars,
engagement participation, asset readiness and approvals. Current Projects can
reference an engagement, but do not implement staffing recommendations, capacity
planning or automatic asset/approval coordination. The roadmap is not a claim
that these integrations are already delivered or unique to SPH. Suggestions never silently assign employees or
change contracts. CI/CD, external guests, external AI and collaborative realtime
document editing are excluded from the first delivery.

### Search defaults and unassigned tickets

Project-group simple and advanced searches use the same unset-selection label:
Any. This means no filter and is restored by Clear. The assignee quick
filter additionally offers Not set: this selects tickets with a NULL
assignee ID. Missing or deleted employee records are not treated as NULL IDs.
The existing `definition.options.assigneeIds` CSV accepts the reserved token
`unassigned`, only for assignee quick filters. Combining it with employee IDs
means NULL OR any selected employee; other quick/advanced/keyword conditions
are ANDed. The token survives session restoration and saved filters. Project
visibility, reference validation, soft-delete filtering and pagination still
apply. Shared ticket search controls provide this behavior in cross-project and
individual ticket lists, ticket panels and Gantt pages.

## Editor tabs and selected notification recipients

Project descriptions (creation, editing and overview), ticket descriptions and
comments use full-width Input/Preview tabs on desktop and mobile. Switching tabs
keeps the text and image upload state. Widget editing is unchanged.

Ticket creation/editing and comment creation/editing offer a searchable **Users to
notify** multi-select. Candidates are project members with active, non-retired,
non-deleted accounts, excluding the author. Selection starts empty, is limited to
50 entries, and applies only to the current operation; it does not add watchers.
Failed submissions keep the text and recipients. Successful submissions or
cancellation clear the selection. Recipient-only changes count as unsaved edits.

Ticket POST/PATCH accepts optional `mentionIds: number[]`, matching the existing
comment POST/PATCH interface. Project detail members include the identity-safe
`canReceiveNotifications: boolean`. The server revalidates active membership and
account eligibility for explicit recipients before saving. Invalid selection
returns 422 `INVALID_MENTIONS`; missing selection remains backwards compatible.

Existing comment-addition and assignment notifications remain automatic. Selected
recipients are added without duplicates or self-notifications. Ordinary ticket
updates and comment edits notify only selected recipients. Creation without an
assignee uses `project.ticket.created`; ordinary updates use
`project.ticket.updated`, and comment edits use `project.comment.updated`.
Assignment and comment-addition events retain their existing types. Notifications
are committed with the ticket/comment transaction, and target resolution continues
to enforce access to the ticket. No database migration is required.


## Monthly EVM

### Set up execution management

Open a project's **EVM** tab. A project manager with monetary management permission
can enable EVM from a selected month and choose JPY or USD. Amounts exclude tax.
Set effective-dated project-wide standard hourly rates, select disjoint ticket
work packages and allocate each budget across months. Parent and child work
packages cannot both receive budget in the same baseline. No past opening
balances or employee-specific salary costs are inferred.

Save a draft or confirm a baseline with a reason. Confirmed baselines are retained;
changes create another version. Currency and start month are locked after the
first confirmed baseline. Add ticket expenses and record each work package's
cumulative monthly progress with evidence. Time-entry costs use the work date and
the hourly rate effective on that date, rounded per cost line (JPY whole units,
USD cents). Frozen baseline hierarchy determines the work package attribution.
Unmapped work, missing rates or unassessed monthly progress block confirmation.

Preview calculations update automatically on initial load, baseline/month selection,
and saved EVM changes. Review the work-package breakdown, then confirm a completed
month. Loading and errors are visible; outdated requests cannot replace the current
selection, and confirmation is disabled until a valid current calculation is ready. Baseline/report confirmation requires dedicated operations, with no second
approver. Reports preserve the exact source evidence and calculated snapshot.
Corrections to tickets, time, rates, expenses or progress flag affected reports
for reconfirmation; a corrected report creates a new version and retains the old
snapshot. Stale reports are excluded from portfolio totals.

The cumulative PV/EV/AC chart and work-package variances support drill-down,
keyboard/touch inspection. The data table is always visible in a separate bordered
section below the chart; no previous/next buttons or inspection hint are shown. CV=EV−AC, SV=EV−PV, CPI=EV/AC and
SPI=EV/PV. SV is money, not days late. EAC=BAC/CPI is a conditional forecast;
zero denominators are displayed as unavailable.

### Permissions and REST contract

Operations:
`projects.financial.read`, `projects.financial.manage`,
`projects.baselines.confirm`, `projects.evm.confirm`. Monetary and confirmation
operations default to system administrators only. Existing project membership and manager checks
still apply; an operation grant alone does not reveal a private project.

REST resources: `/v1/projects/{id}/evm-settings`, `cost-rates`, `expenses`, `baselines`,
`progress-records`, `evm-preview`, `evm-reports`. Amounts and numeric outcomes
are decimal strings. Existing ticket/time-entry APIs remain the actual-work
source. Lists use bounded `offset`/`limit`; revisions reject conflicting writes
with 409. Baselines, progress and reports append versions; they are not overwritten.
The fresh-install `m0046` baseline includes project-level EVM and excludes the retired OKR tables and permissions.
No additional third-party libraries or assets are included.


### Optional installation data for EVM

Selecting additional data during a fresh installation also configures the three
fictional projects (DEVELOP, MIGRATION and WEBSITE) for monthly EVM. Each includes
a confirmed baseline, five disjoint work packages, monthly budgets, standard hourly
rates, time entries, expenses, evidence-based progress and three confirmed monthly
reports. Months are relative to installation: the three most recent completed
months. All three projects use JPY for Japanese installations and USD for English
installations, including their budgets, standard hourly rates, expenses and reports.

Open any of the three projects' **EVM** tabs for PV/EV/AC curves, variance
breakdowns, report evidence and forecasts. Initial administrators can inspect the
monetary data. These examples are fictional original application data. Both
Japanese and English installations are supported. Without additional data these
projects and management records are not created. Existing installations are not
backfilled by this option.

### Ticket history tab

Ticket details include a History tab with all recorded ticket operations, newest first, including comments, time, checklists and attachments. Content is always visible. Description changes show a plain-text Markdown line diff with added (+) and removed (−) lines. Old records without both descriptions do not infer a diff. Large comparisons fall back to whole changed blocks.

`GET /v1/projects/{project}/tickets/{ticket}/history` uses the existing `projects.read` and project visibility checks, accepts numeric IDs or codes, and returns the project-history shape with standard pagination and `id`/`createdAt` sorting. The default page size is 100 (maximum 500).

Optional installation data includes two description revisions and related comment/checklist history for DEVELOP-0003, MIGRATION-0003 and WEBSITE-0003. Their latest description matches the final recorded revision; the first revision demonstrates unchanged, added and removed Markdown lines and a status change. These records are created only during initial optional-data installation, never backfilled into existing projects.

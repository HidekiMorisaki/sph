# Workflows

Request/preview grid rows size to their rendered content rather than imposing a
36px minimum per saved designer row. This avoids unused vertical space after a
single-line input that spans multiple designer rows, while retaining saved grid
coordinates and the standard 18px gap between adjacent fields.

Repeated groups show their group legend once, without numbered titles on each
row. Adjacent rows are separated by a one-pixel subtle rule; no rule is added
above the first or below the last row. Shared row add/remove actions remain
available while editing; read-only rows omit the action header.
Row deletion controls appear only after the minimum protected rows: with a minimum
of one, the first row has no delete control and later rows do. Required groups
protect at least one row even without an explicit minimum. This also applies to
table-form repeat rows; editable input in protected rows remains available.

On desktop, table fields show their names and required indicators in column
headings. Repeated input labels are visually hidden while retaining accessible
names. On mobile the header row is hidden and each stacked cell shows its own
field name once. Labels outside table cells keep their normal display.
The number column is vertically centered within each desktop row.
Designer child tabs run from left to right: Design form, Preview, Approval route.

`/workflows` is available below Schedule in the General group. System settings →
Workflows has "Templates" and "Designer" child tabs. Create, edit and duplicate
open the designer tab. Selecting Designer directly starts a blank template;
Edit opens the selected saved template. Replacing an editor asks before discarding
unsaved changes. The tab bar has no plus button. Saving stays in the current
editor and shows a completion notice. Switching to Templates keeps an unsaved
editor mounted until replacement. There is no separate designer Close button.
Cash advance, expense report and
weekly report templates are registered there by default without a sample suffix
(localized on installation, including field labels and initial values). They are ordinary editable templates: edit, duplicate
or delete them, configure approvers, save and publish as needed. They start
unpublished with an empty approval route. There is no separate sample-template tab.

Installation and upgrade setup add each default only once, using a stable template
identifier. Later setup runs do not overwrite edits, change its language, or
recreate a logically deleted default. Existing custom templates are preserved.
The settings API returns stored templates in `data.items`; it does not return a
separate `data.samples` catalogue.

Workflow screens use the application's shared form, date, selection, tab and
notice components. Basic template fields have bounded widths; Description is last, follows Name
and fills the remaining row with a 240px minimum
when space permits. It wraps within narrower screens. Field actions and
selectors share a 36px desktop height and 44px compact height; required markers
share the warning color. The request list becomes a compact labeled list with
20-item pages on mobile, retaining its search conditions.

Page-level notices align with the content cards. Embedded notices align with
their container's content; the unpadded designer keeps its form-content inset.
The request-list plus button opens the shared modal template chooser. Closing
or cancelling restores focus to the plus button; selecting a published template
and creating a request closes the chooser and opens the application form in the
shared request modal. Existing drafts, returned requests, submitted details,
approvals use the same modal. The list stays mounted behind
it, retaining filters, paging and scroll position. Desktop places the approval route to the left of the form;
compact screens place it above the form. A button at the top left of the modal
body shows or hides the route; hiding it gives the form the available width.
The route starts hidden for each opened request and retains its state through
saving, submission and version switching. Toggle operations retain all inputs.
Review, return, withdrawal and reassignment controls remain in the form area,
independent of route visibility. Only the modal body scrolls;
save, submit and close actions remain in the shared footer.
The approval-route toggle uses the same shared 32px action component as Save
draft, including on compact screens. The designer's information icon opens the
shared popover without expanding the canvas; Escape and outside click close it.

## Template publication and request versions

Workflow setup uses Templates and Designer tabs. The Version selector in a request
chooses Current or a numbered submission snapshot; it does not choose a template
version. Submission snapshots are read-only records of the submitted form.

Saving an active template with a configured approval route publishes a new
immutable version in the same transaction. Saving with an empty route instead
saves it unpublished. Publication validation applies to the save: an invalid form or
unavailable approval route rolls back the template save, publication and draft updates.
Requests that are still drafts, have attempt zero and have never had a submission
follow the new version. Their title, currency, entered values and attachment
bytes are retained without automatic conversion or deletion. New fields receive
defaults when the form is opened. The draft revision advances, so a stale editor
cannot overwrite a refreshed draft. Previously submitted requests, including
returned, approved, rejected and cancelled requests, keep their original versions
and submission snapshots. Creating from an older cached chooser still resolves
the latest published version on the server; the form uses that returned version.

Saving an inactive template remains private until publication. Installing this
behavior does not automatically publish previously saved private differences;
saving the active template again applies them with the validation above.

## Deleting an unsubmitted draft

The draft list and request footer offer a shared delete action with confirmation.
Only the applicant with the explicit `workflows.delete` operation may delete a
draft that has never been submitted. Submitted, returned and other people's
requests cannot be deleted through this operation. Updates use the request
revision guard, including when deletion races with submission. The request,
attachments and related actions are logically deleted; attachment originals and
the audit record remain stored. New installations grant the operation to the
five initial roles; custom roles require explicit selection by an administrator.

Saving or submitting keeps the modal open and displays its result inside it.
Close, the header cross and Escape share the unsaved-change confirmation; pending
operations prevent closing. Continuing editing retains inputs and focus. Closing
restores focus to the originating plus/request button, or the list heading if the
request is no longer listed. Attachment previews and discard confirmations take
keyboard precedence over the request modal. Direct request/action links open the
same modal and focus the referenced history entry; closing removes only those
query parameters. New request forms remain in browser memory until the applicant explicitly saves
or submits. Opening the form, entering values and selecting attachments do not
create a request or upload files. Closing an unsaved new form via the cross,
footer or Escape always asks whether to continue or discard, even before editing.
Continuing retains inputs and attachments; discarding leaves no draft. Navigation
and browser-unload guards also cover unsaved new forms. Existing saved drafts keep
their usual edit/discard behavior.

Save/submit uses the existing REST creation, attachment and update operations.
Staged attachments upload only after explicit save/submit; server validation and
permission/revision checks remain authoritative. If a save fails after allocating
a request, it retains that key and the unsaved input/files for retry, preventing
duplicate drafts. Unsaved forms have no request number, draft deletion or financial
operations until their first save.

## Templates and forms

The designer supports repeated instances of each component, groups, repeatable
groups, line-item tables and pages. Components include text, numbers, money,
percentages, date/time ranges, choices, employees, branches, departments,
applicant information, attachments, calculated values and display-only content.
Fields have independent identifiers, labels, help, defaults and limits. Reference
choices show the parent hierarchy to distinguish fields with identical labels.
The form designer uses an eight-column grid with compact 36px rows. Drag a component
into any empty cell, including cells inside a group, and drag existing cards to
move them. Drag any card edge to expand or shrink its size in whole cells;
occupied cells and the grid boundary block expansion. Left/top edges move the origin while keeping the opposite edge fixed. The edge also supports the
arrow keys. Selection uses a three-pixel primary-color border. Clicking canvas
whitespace, an empty cell or any other page area clears the visual highlight without moving the component.
The property editor retains its target and input values after the highlight clears. Layout changes participate
in undo/redo.
The three editing columns grow with their contents and use the page's vertical
scrolling. A one-row component is 36px tall and shows its heading; preview keeps
the actual input controls and grows rows as needed. Horizontal scrolling remains
inside narrow canvases. Every card has the same 3px border on all four sides;
selection changes the border color. Vertical resizing uses row height independently
of column width. Existing grid coordinates and submitted versions are preserved.

The Components and Properties columns resize independently by dragging their
separators. Inputs, palettes and actions follow their column width, wrapping when
needed. A minimum canvas width is retained, with automatic adjustment on narrower
screens. Arrow keys resize a focused separator; Home/End use its limits, Escape
cancels a drag, and double-click restores the defaults. Width changes are local
to the open editor and do not enter template history.

The left column has Components and Outline tabs. Outline groups can collapse
without losing their child selection. Checking a group checks every descendant;
partial selection is indicated, and grouping uses selected outermost components
so a checked parent and its children are not duplicated.

Form layout and Approval route each have separate Undo, Redo and Save actions.
Form saving persists the name, description and fields; route saving persists only
the approval route. Each preserves the other's unsaved edits and history. Save
a new form before saving its route. Preview has no save action. The information icon beside
Form layout toggles placement and resizing instructions, hidden initially.
Arrow movement uses an empty neighbouring row when available. When blocked it
exchanges visual order with the adjacent component and reflows siblings while
preserving dimensions and nested contents. Changes are undoable and saved through
the usual template API. Unavailable movements, destinations, grouping, duplication
and saving are disabled rather than silently doing nothing.

Fine rectangles carry `scale: 2`; unmarked four-column rectangles are interpreted at twice the resolution to preserve their position and size. Grid column, row, width and height are stored in each field's optional `grid`
rectangle in the existing definition JSON. The API checks integer bounds and
sibling overlap; different groups have independent coordinates. Saving an edited
template records layout in its next published version. Preview and application
forms use those coordinates, with content allowed to grow vertically. Narrow
forms and phone previews stack fields in visual reading order and retain the PC
layout. Existing definitions without grid coordinates keep their original form
rendering until edited; previously submitted versions are not rewritten.

Drag a component from the palette into the form or a group to place it. Move
existing fields by dragging within the form; drop an existing field outside the
form canvas to delete it. Drag feedback distinguishes placement from deletion.
Referenced fields require deletion confirmation, and undo restores the component
and its references. Dropping a palette component outside the form cancels adding
it. Escape cancels a drag. Arrow buttons and destination selection remain
available for keyboard and touch use. Select
fields at the same level to group them; grouping and structural changes can be
undone. Undo/redo also covers conditions, calculations and approval routes.

Conditions control visibility and required input. Calculations support sums,
counts, four arithmetic operations and inclusive days in a date range. A row can
reference its own fields and form-level fields. Form-level sums/counts can
aggregate a repeated column. References to unrelated rows, incompatible types,
deleted fields or cycles are rejected. Hidden fields do not contribute to totals.
Decimal arithmetic uses fixed-point integers; each calculation rounds to its
configured precision, with half values rounded away from zero. Money inputs and
calculated money values must fit the selected currency's precision.

Preview supports form inputs, page navigation and temporary attachment selection.
Preview files stay in that browser session and are not uploaded as applications.
Saving an active template with a nonempty approval route publishes a new
immutable version atomically; inactive templates require explicit publication.
New requests and never-submitted drafts follow the current published version,
while previously submitted requests retain their original version. Unpublishing
prevents new requests and first submission of existing drafts. Returned requests retain their route and
can be resubmitted after correcting their inputs.

## Submission and approval

Applicants save drafts before submission. Every route has a fixed sequence of
approvers; all steps are required and the last approval is final. Applicants
cannot approve their own applications. The current assignee must have current
workflow read/approval permissions. An administrator can replace an unavailable
assignee on an unapproved step, with a required reason; this is not proxy approval.

Approval comments are optional. Rejection and return reasons are required and
cannot contain only whitespace. Applicants can read review comments and standalone
comments. Each decision notifies the applicant. Returns additionally notify all
earlier approvers in that circulation. Resubmission starts at the first step and
keeps prior submissions, decisions, comments and originals. Notifications link to
the relevant history entry. Versions retain the submitted title, currency,
applicant, selected directory names, form definition, input values and route.

Read access is limited to the applicant, circulation assignees and system
administrators. Drafts are visible only to their applicant and administrators.
Unrelated requests, comments, candidate users and files remain unavailable.
Updates require a matching revision and are serialized to reject stale actions.

## Attachments

The editable attachment field shows only a Choose files button; the native
filename/empty-selection text is hidden. Limit guidance appears as an error only
when a selection exceeds the limits. Valid retries clear the error.
Empty file lists add no space between the label and picker; the button uses the
shared field height (36px on desktop, 44px on mobile).
JPEG, PNG, static WebP and PDF are accepted: 10 MiB per file, 20 active files and
50 MiB per application. Uploads require applicant ownership and an editable
request. Content type, signatures and size are validated; PNG/JPEG are decoded
with memory/resolution limits, and WebP structure and static-frame dimensions are
bounded. Images are limited to 16 million pixels and 16,384 pixels per side.
Animated WebP is rejected. PDF validation checks its header and end marker; it is
downloaded as an attachment and never executed inline by the application.

Original bytes, digest and metadata are stored privately. Downloads recheck
request access and use private/no-store, nosniff and sandbox headers. Unused files
can be removed after saving a draft. Logical removal retains originals referenced
by past submissions. File uploads have a separate gateway payload limit to allow
multipart overhead; the application still enforces the file limits above.

## Generic forms and optional approval routes

The designer has no Purpose or Total amount field setting. All templates use the
same generic form contract (`version` and `fields`). Money inputs, currency
precision and calculated fields remain available for ordinary forms. The three
sample forms remain editable examples; their names do not enable special runtime
behavior.

Templates may be saved with an empty approval route. Such templates are unpublished
and their Publish action is disabled. The publication API independently rejects
an empty route. Saving a published template after removing every route step makes
it unpublished without creating a new published version. Existing submitted
requests retain their own route and approval history. A route-free save shows that
it was saved unpublished; adding a route permits a later explicit publication.

Purpose-specific advance/expense logic, linked advances, transfers, refunds,
receipt confirmations and financial permissions have been retired. Their REST
paths return 404. The transfer table and advance-link column are removed. Existing
requests, input values, submissions, approval/action history and attachments remain;
immutable historical snapshots may retain their original obsolete metadata as
recorded evidence. Active template definitions omit that metadata.

## Request search and list

`/workflows` uses the same SearchPanel and MasterList as employees: an independent
search card followed by the request data card. The data header retains the plus
action, page-size selection, sorting and pagination. The old workflow business
view tabs are replaced by search filters. Initial search covers all requests that
the current actor may read.

Simple search includes title/template/participant keywords, view (all visible,
mine, awaiting my approval), multiple statuses/templates, and multiple applicants,
approvers, final approvers and current assignees. Names and employee codes identify
user choices. There is no reviewer search item. Multiple selections within a
filter use OR; separate quick filters use AND. Keyword terms use AND across terms
and match title, template and participant names. Wildcards are literal.

Advanced search has basic fields, participant relation groups, created/updated
time ranges and the shared related-field controls. There is no compound-condition
tab or root condition editor. Final approvers are the last route
position, and current assignees are the active pending step. Before submission,
approver searches use the selected template version's route. By default submitted
requests use the latest attempt. Include history adds earlier attempts and original
submitted routes, including assignees replaced later. Current and recorded names
can be searched. Candidate choices only derive from requests the actor can read.

Search updates after 250ms, resets paging, and discards stale responses. Clearing
resets the complete search. Saved filters use the shared owner-only filter API
with workflow read and filter-operation permissions checked independently. Loading
a saved definition revalidates its fields, referenced candidates and permissions.
Closing a request retains search, sort, page and background scroll state.

## REST and storage

All browser actions use authenticated JSON REST endpoints under
`/v1/workflow-templates` and `/v1/workflow-requests`, including publication,
submissions, decisions, comments, route changes and attachments. Search uses
`POST /v1/workflow-searches`, field definitions use
`GET /v1/workflow-search-fields`, and saved filters use
`/v1/search-filters` with target `workflows`. Lists use allowlisted
sort fields and offset/limit (default 100, range 1–500). The frontend does not
access Prisma or the database. `m0036` adds the eight workflow tables, their record
management columns, serial IDs, independent identifiers and restrictive FKs.

The developer recovery exporter includes workflow history, submitted attachment
originals and related tombstones. Restore remaps FKs and typed IDs embedded in
routes, definitions and submitted snapshots without rewriting names or document
contents. Standard full database backups remain necessary for operational recovery.

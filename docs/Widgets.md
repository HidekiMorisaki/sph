# My Page widgets

SDK v2 is the current authoring format. Users can create HTML/CSS/JavaScript widgets in `/widget-editor`, save private drafts, export HTTPS catalogues and request administrator approval. All seven official widgets use the same sandbox/Worker SDK. See [Widget SDK](Widget_SDK.md) for the current format and developer workflow. Legacy declarative text/list/clock/records definitions remain supported; the former built-in calculator/timer/note view types are retired.

The sections below retain historical v1 UI and maintenance details; do not apply their old catalogue/checksum tools to SDK v2 definitions.


The current storage contract is [Widget storage](Widget_Storage.md). New v0.6.0 installations use shared JSONB records; the old note/time-zone layout format is not supported. Historical maintenance procedures below do not apply to this storage change.

System settings shows a per-release user count and asks for confirmation before
stopping a release with users. Hidden cards are included; duplicate cards from
one employee count once. Deleted instances, layouts and employees are excluded.
The administrative `GET /v1/widget-releases?review=true` includes `usageCount`;
the personal catalogue does not expose this aggregate or any owner identities.
When stopping through `PUT /v1/widget-releases/{id}/approval`, send the displayed
count as the optional non-negative integer `confirmedUserCount`. An in-use
release returns HTTP 409 `WIDGET_IN_USE` if this count is absent or below the
current count, with `error.details` containing `{field:"usageCount",reason:"N"}`.
The UI displays the current count and asks again. Zero-user stops and enabling a
release need no count. Existing administrator/operation and digest checks remain
required. New placements and stops coordinate release locks so a concurrent
placement is either counted before the stop or rejected after it. Stopping keeps
existing layouts, settings and saved records.

The catalogue header's plus button opens the source registration modal. Existing
source listing and catalogue refresh operations remain in the Sources card.

My Page has a catalogue modal and independently configurable widget cards.
All current size IDs use ASCII `rowsxcolumns` and match their `sizeLayouts` entry.
The unpublished m0032 seeds the seven current official releases with canonical
IDs, no approvals and no personal placements. It clears obsolete legacy widget
placements; m0033 removes the old placement table. The size column has no default:
callers must explicitly choose a declared size. Historical size-maintenance
procedures below predate this clean start and are not applicable to this seed.
Authors define each size as 1–8 rows and 1–8 columns. The minimum cell is a 230px
square. The grid fits one to nine columns, chooses a count that respects that
minimum, and distributes remaining width equally between them with 12px gaps.
Each row uses the resulting column width, so 1×1 cards remain square and a filled
row reaches the grid's right edge. On screens narrower than 230px, a single column
shrinks to fit. Existing row/column definitions and saved size IDs are unchanged.
For a cell width S, R rows and C columns measure `C*S+(C-1)*12` by
`R*S+(R-1)*12` px. A final partially filled row retains its unused cells.

At a 2560×1440 CSS-pixel viewport, nine columns fit with the desktop sidebar
expanded or collapsed. Author-defined sizes remain limited to eight columns.

Body text, numbers, clock faces and the add icon scale by `min(S/320, (S-82)/(320-82))`, accounting for the fixed
82px header, padding and borders in smaller cells, including after
window or sidebar resizing. Card titles and action controls keep their standard
sizes; detail modals opened from content retain normal text and control sizes.
Size-fit measurements use the same live cell width and scale as the actual card.
Card bodies
never scroll. Settings offer only sizes that fit the current data at the current
screen width. Long lists use a bounded summary and a common full-content modal;
if no size fits, the card provides a settings hint and access to the complete content.
Free cells are filled with later cards where possible, so mixed sizes may differ
from saved reading order. The dashed 1×1 add tile occupies the first free cell from
the top, to the right of existing cards when there is room. It opens the focus-trapped
catalogue modal. Its compact common widget and size pickers stay on one line,
including phones; long selected labels are ellipsized.

Official 1.0.0 footprints (rows × columns):

| Widget | Small | Medium | Large |
| --- | --- | --- | --- |
| World clock | 1×2 | 1×4 | 1×6 |
| Calculator | 2×1 | 2×2 | 3×2 |
| Calculator (Programmer) | 3×2 | 3×3 | 3×4 |
| Timer | 1×2 | — | — |
| Stopwatch | 2×2 | — | — |
| Unit converter | 2×2 | — | — |
| Note | 2×2 | — | — |

Note additionally offers `compact`, 1×2 cells. Existing `small` selections
remain 2×2.

Card titles use a consistent 18px subsection font across all sizes, with up to two
lines inside the 48px header. Narrow titles truncate without overlapping controls.
Each card has an information icon, a settings icon and a drag handle, in that order.
The information modal shows author, version, provider, developer description and
license, with normal text size, keyboard focus containment and focus return. Drag/drop, touch
release and the handle's Up/Down keys save the new order immediately. There is no
separate layout editing mode. A failed order save keeps the arrangement for retry,
cancel or reload; concurrent updates are rejected without overwriting the server.
On the grid, dragging previews the resulting positions before release. Dropping on
free cells preserves every other card's position and keeps the empty space after
reload. A drop on another card changes the array order and repositions intervening
or overlapping cards without leaving overlaps. The add tile remains in the first
free cell. Invalid partial overlaps or out-of-bounds empty targets are marked in
red and do not save. Escape, drag cancellation and touch cancellation discard the
preview. The grid exposes additional empty rows while dragging.
Touch drags scroll the page near the top or bottom edge to reach off-screen cells.
The column count stays fixed during a drag if its extra rows open a scrollbar;
resizing the viewport cancels the preview.
Positions apply only at their saved column count; other column counts use automatic
packing. Returning to the saved count restores the positions. The compact tool
layout on phones remains a vertical list; reordering that list preserves desktop
coordinates. Resizing a card reflows collisions; a position that no longer fits at
the right edge is cleared. Adding or removing cards preserves the other anchors.
Settings use a draft and common selection controls. The header places the widget
name and settings title on one line where space permits, with compact vertical
padding. Remove, Cancel and Save use the shared 32px modal action buttons; the
footer wraps on narrow screens. Size and confirmed removal
are available for every card. Visibility toggles are no longer offered. World clocks offer one or more selectable IANA time zones, without a city-count limit,
and digital or original SVG analog faces. Save persists settings, Cancel discards
the draft, and conflicts keep the modal's draft. Previously hidden cards are restored
by the reviewed migration maintenance. Removal requires confirmation.
The catalogue's “Add and save layout” immediately persists and displays the card.
The add modal exposes every setting offered after creation: size for all widgets,
clock design and one or more time zones for World clock, and optional title/body
for Note. Both Note fields may be blank. A clock starts from its approved default
city; changing cities, design, size or note content redraws the preview immediately.
Changing the selected release or reopening the modal resets its draft. Cancel
does not write anything; failed adds retain the input and preview for retry.
Content controls follow the server-reported initial-record edit capability.
Adding an instance and its chosen initial content commits in one transaction.

## Administration and distribution

System settings → Widgets registers public HTTPS catalogue sources, fetches their
releases, previews them, and allows or stops each exact version. The bundled
`api/widgets/` directory is the official offline source (`bundled:sph`), separate
from the renderer. World clock, both calculators, Timer, Stopwatch, Unit converter
and Note are in the official catalogue and require
administrator review. New layouts start empty. The four retired official widgets cannot be
listed, approved, added or accessed through the data endpoint.

The explicitly approved retirement script physically removes all versions of the
four retired official widgets, their instances and approvals, and legacy account/book
settings. It preserves World clock definitions, approvals and instance settings,
advancing revisions only for layouts that lose active cards. Initial administrator
setup runs the same idempotent cleanup. Existing installations run
`node api/scripts/retire-official-widgets.mjs --apply` after backup, before starting
the updated API. Without `--apply` the transaction rolls back. The historical
`seed-catalogue.json` is used only to verify the immutable migration seed before
sample installation; it is never fetched as the current catalogue.

Stopping a release
blocks existing instances at the data endpoint as well as new installations.
Removing an enterprise source stops all its releases; the official source cannot
be removed. The audit log records source and approval changes.

Definitions are immutable snapshots identified by source, ID, version and SHA-256.
Republishing different content with the same ID/version is rejected for the whole
fetch. Publish a new version and review it separately. Existing layouts stay on
their selected version; no update installs code or changes approval automatically.

External sources must return `application/json` (or a `+json` media type), maximum
1 MiB, within 10 seconds after DNS resolution (5 seconds). Only port 443 is allowed.
Credentials, query strings, fragments, redirects, non-public IPs and non-public
DNS answers are rejected. The validated IP is pinned to the TLS request. Enterprise
sources on private networks are intentionally not supported in this contract.

## Calculator

`{ "type": "calculator" }` is a fixed, application-owned interactive block. It
must be the only block, with no data attributes, capabilities or settings. Every
size must declare at least two rows. It provides no mechanism for executing
widget-authored code. Four retired official widgets remain retired.

The calculator supports arithmetic in entry order, repeated equals, decimal
input, contextual percentages, sign changes, C, CE and backspace. Exact integer
fractions handle decimal operations and round results to 16 significant digits.
Division by zero and results outside exponents -99 through 99 show localized
errors; digits, C or CE recover. The 16-digit input limit includes leading zeroes.
For +/-, percent uses a percentage of the left operand; for ×/÷ and standalone
input, it divides the displayed entry by 100.

Keyboard input is scoped to focused calculator buttons; it never captures typing
in other page controls. Enter evaluates, Backspace deletes, Delete clears entry,
and Escape clears all. The preview is interactive and its calculation is separate
from the card. Measurements are inert. Buttons retain at least 44px targets; the
card body never scrolls. Small is 2 rows × 1 column, medium 2×2, large 3×2.

Calculation state belongs only to each component in browser memory. It is not
sent to the API or saved with the layout and resets on reload. The existing
owner/approval-guarded data endpoint returns only its usual date for this block.
There are no new dependencies, fonts, images or third-party calculator code.

Existing installations fetch the bundled source and approve Calculator 1.0.0 in
System settings before adding it. Initial setup preserves the immutable historical
migration seeds; newly bundled releases are registered through the same catalogue
refresh workflow. Calculator has its own developer description in the manifest.

## Developer information

A manifest may include `author` (a nonempty string, at most 160 characters) and
`description: {"ja":"説明", "en":"Description"}` (both nonempty, at most 10,000
characters each). These fields are included in the immutable definition and digest;
publish a new version when changing them. Descriptions are plain escaped text,
with line breaks preserved. No HTML or Markdown is executed.

`GET /v1/employees/me/widget-layout` adds `information: {author, description}` to
each instance. Author falls back to `provider`; missing descriptions are `null` and
shown as not provided. Existing official World clock 1.0.0 gets its supplementary
description from `api/widgets/information.json` only when source, version and exact
bundled definition digest match. Its stored definition and approval stay unchanged.
All other definitions use their own metadata and cannot inherit official text.

## Contract 1

The root object has exactly `schemaVersion: 1` and `widgets` (up to 100 releases).
A release has these fields; unknown fields or unsupported capabilities fail closed:

```json
{
  "id": "example.branch-clock",
  "provider": "Example company",
  "version": "1.0.0",
  "schemaVersion": 1,
  "name": { "ja": "拠点の時計", "en": "Branch clock" },
  "sizes": ["1x2", "1x4"],
  "sizeLayouts": {"1x2": {"rows": 1, "columns": 2}, "1x4": {"rows": 1, "columns": 4}},
  "capabilities": ["world_clock"],
  "settings": {},
  "view": [{ "type": "clock", "data": "world_clock" }],
  "license": { "name": "Your reviewed license", "url": "https://example.com/widget-license" }
}
```

Wrap this release in `{"schemaVersion":1,"widgets":[...]}` to publish a catalogue.
Review actual license text, copyright notices and redistribution obligations before
allowing a third-party definition. The manifest's license label is not a substitute
for that review. No third-party executable dependencies were added for this feature.

Supported blocks: localized `text`, literal finite `number` (`value`), `date`, `list`
(`data`), `clock` (`data: "world_clock"`), and localized `link`. Links are restricted
to SPH books/my-page/personal-settings/employees pages; numeric employee/book IDs open REST-backed detail modals without navigating to nonexistent routes.
Detail modals use the existing API permissions and return focus to their trigger. There are no
HTML, JavaScript, expressions, CSS, arbitrary API calls, external scripts or iframes.
SPH renders ordinary escaped text; widget definitions never receive session tokens.
An isolated web renderer is a future contract, not part of this implementation.

Capabilities: `book_notices` and `book_loans` (current user's active loans, requires
`books.read`); `account` (current user's email and role names); `world_clock` (IANA
time zones via Intl). A list block
selects its declared capability. A capability must be explicitly declared even if
another block uses its data. Persistent note text and time zones use the [shared record contract](Widget_Storage.md), while manifest `settings` is empty. All selected clocks are accessible at every
size. The clock collection is centered horizontally and vertically. When clocks
exceed the card width, left/right buttons reveal the previous/next clock without
scrolling; buttons disappear when all clocks fit. Analog faces use an original SVG
bezel, 60 ticks, shaded hands and local day/night palettes. Faces use 192px at the base cell size and scale with the cell,
shrinking to fit their available width. Lists initially show
up to three entries and open the full bounded response in a common modal.

There are at most 64 size choices (the 8 × 8 combinations).
`sizeLayouts` is required and must exactly cover `sizes`. Each size ID must be `rowsxcolumns` using ASCII `x`, for example `1x2` or `6x6`; rows and columns must be integers 1–8 and must match the ID. Old size names such as `small`, `medium`, `large` and `compact` are rejected.
Without this optional map, only legacy small/medium/large are supported, with
1×1 / 1×2 / 2×2 footprints respectively. Undefined, duplicate or invalid sizes
are rejected by the REST contract. The DB enforces the identifier format too.
Independently of immutable manifest settings, instances with `world_clock` may
include renderer-owned `clockDesign: ["digital"]` or `["analog"]`. An absent value
keeps the existing digital appearance. The server rejects other values, multiple
values and use on non-clock widgets. No manifest revision or DB migration is needed.
All instances may also include renderer-owned
`settings.gridPosition: ["9", "2", "3"]`: saved column count, one-based column and
one-based row, in that order. Each is a canonical positive decimal string; columns
are 1–9, rows are 1–320, and the selected footprint (clipped to the saved column
count) must fit horizontally. Absent positions keep automatic packing. These
preferences do not modify approved manifests or need a DB migration. The layout
and record-presentation APIs use the same settings validation. Conflicting saved
positions (for example after a size change) are resolved deterministically in
array order, preserving non-conflicting anchors before filling free cells.

## REST resources

All responses have matching HTTP/`responseCode` and `status`. Mutations require the
normal same-origin session/Origin protection. No widget credentials use URL/body.

| Resource | Methods | Authorization |
| --- | --- | --- |
| `/v1/widget-sources` | GET, POST | system.manage + system.widgets.sources.update |
| `/v1/widget-sources/{id}` | DELETE (logical) | same |
| `/v1/widget-sources/{id}/catalogue-revisions` | POST | same |
| `/v1/widget-releases` | GET | widgets.read; `review=true` uses admin approval permission |
| `/v1/widget-releases/{id}/approval` | PUT `{allowed,digest}` | system.manage + system.widgets.approvals.update |
| `/v1/employees/me/widget-layout` | GET, PUT | widgets.read / widgets.layout.update |
| `/v1/employees/me/widget-instances/{key}/data` | GET | owner + widgets.read + active approval + data permissions |

Catalogue/source lists support `sortBy`, `sortOrder`, `offset`, `limit` (1–500,
default 100). Allowed source sorts: id/name; releases: id/widgetCode/version.
Layout is one bounded resource (40 instances), not a paginated list. PUT requires
`{revision,instances}`. Each instance has UUID `instanceKey`, numeric `releaseId`,
`size`, `enabled`, and `settings`. The array defines order; omitted instances are
logically removed. The layout revision increments once. Stale revisions return 409.
Instance identifiers cannot be reused by another owner or after deletion. Multiple
instances may use the same release with different settings. A newly initialized
layout stays empty.

## Consolidated unpublished m0032

By explicit owner instruction, the later unpublished m0033 is incorporated into
m0032. The widget table is created with the final size-ID CHECK and the catalogue
is inserted directly as the five authored-size 1.0.0 definitions. There is no
intermediate widget ALTER or old-definition update during a fresh install.
Legacy widget preferences become visible cards when imported. Existing deployments
that already applied the development m0032 and m0033 require the reviewed local
consolidation tool after a complete backup; do not manually replace migration
checksums or rerun the table creation. The tool verifies known checksums and the
final schema/catalogue, preserves data/settings/order/approvals, restores active
hidden cards and increments affected layout revisions, then reconciles history
transactionally. This is pre-release local maintenance, not a supported public
upgrade procedure; it never runs in product startup.

The owner explicitly requested resetting official widgets to 1.0.0. Superseded
versions are logically removed and existing instances reference their canonical
1.0.0 release. This one-time maintenance does not relax the normal immutable
same-version catalogue rule for enterprise sources or future releases.

## Programmer calculator and saved standard name

`sph.calculator` 1.0.0 is named 電卓（標準） / Calculator (Standard).
The owner explicitly approved updating the saved official definition and digest.
`scripts/rename-standard-calculator.mjs --apply` performs this name-only revision
transactionally after verifying the exact previous definition and digest.
It preserves release IDs, approvals, instances, settings and layout revisions;
unknown definitions are rejected. Back up the database and stop API writes first.
Without `--apply` it rolls back. Other same-version changes remain forbidden.

`sph.programmer_calculator` 1.0.0 offers HEX/DEC/OCT/BIN, 8/16/32/64 bits,
signed/unsigned decimal interpretation, integer arithmetic, remainder, AND/OR/XOR/NOT
and logical shifts. BigInt preserves every bit; overflow wraps at the selected width.
Division truncates toward zero and remainder follows the left operand's sign.
Shifts accept 0 through width minus one and right shift fills with zero.
Operations execute in input order. Widening signed negatives extends their sign;
narrowing keeps low bits. Width or signed-mode changes clear pending operations;
base changes preserve them. Invalid digits and out-of-range entries are ignored.
Sizes are 3×2, 3×3 and 3×4 cells, with 32px minimum button heights and no internal scrolling.
Numeric and arithmetic keys expand evenly to fill the available body height;
base, hexadecimal and bitwise keys stay compact.
Base-selection labels use 16px text and conversion headings use bold 14px text, with 14px values.
Backspace uses a 24px SVG icon in both calculators.
The owner approved revising the saved official programmer definition in place.
`scripts/compact-programmer-calculator.mjs --apply` checks the exact old definition
and digest before updating only its size layouts and digest. It preserves instance
IDs, size IDs, settings and approvals, advancing revisions of affected active layouts.
Back up the database and stop API writes first; the default is a dry-run rollback.
Both calculators have interactive add previews, keyboard input and information.
Values and programmer modes reset on reload and are never sent to the API or saved.


## Copying calculator results

Click the main result in either calculator to copy its exact displayed value.
The focused result also supports Enter and Space; other calculator input keys
continue to work. Programmer results use the selected base, preserving all 64 bits
and excluding binary grouping spaces. Success or failure is shown beside the result.
Errors and measurement-only previews cannot be copied. If clipboard access is
unavailable or denied, the result stays selectable for manual copying.
Copying does not change calculations, widget settings or layouts. The product
writes to the clipboard only on an explicit copy action and never reads it.

## Compact calculator display and action colors

On compact screens, calculator cards use the available width and natural content
height. Standard keys are 44px high; programmer numeric keys are 32px high, with
six-column hexadecimal/bitwise rows and inline word controls. Desktop cell layouts
and saved size selections stay unchanged. Settings previews follow the same compact
geometry. Mixed mobile boards stack cards without overlapping.

Calculator equals and selected bases share the site-wide muted primary-action
palette used by add/save buttons, with separate light/dark colors and visible hover
background changes. No external design assets or dependencies are required.

My Page omits the redundant Widgets heading and its surrounding panel. Reorder
failure still offers retry and cancel. Page-top spacing comes from the shared
application layout; the card grid adds no top margin.

## Timer, Stopwatch, Unit converter and Note

These application-owned blocks are each the only block in a definition. They
cannot declare data capabilities, code or arbitrary parameters. Timer, Stopwatch
and Unit converter use dedicated layouts; Stopwatch and Unit converter require
at least two rows, while Timer and Note allow one or more.
Timer has a single 1×2 size, Stopwatch and Unit converter each have a single 2×2 size,
and Note has 2×2 (`small`) and 1×2 (`compact`).
On compact screens timing/converter cards use full width and natural content height;
timing content is bounded by the viewport with a 360px floor for short landscape
screens. Notes keep their authored height to bound the text, including in previews.
Fetch the official catalogue and approve each release before adding it.

Timer is a countdown; Stopwatch is a separate widget. Neither has a mode switch.
Both offer start, pause/resume and reset; Stopwatch records up to 100 cumulative
laps. Its card shows all laps that fit its available
area; only when the entire list exceeds that area does it offer the full-list modal.
The condition is re-evaluated after laps and resizing. Timer accepts a positive
duration through 99:59:59 and indicates completion on screen. It does not request
notification or sound permissions. Elapsed
time uses monotonic timestamps rather than interval tick counts, so a delayed
render catches up. Each card and interactive preview owns separate state; timing
and laps reset on reload. Measurement previews do not run intervals.

Unit converter supports length, area, mass, volume, temperature, time and data
size, with live results and unit swapping. US liquid and Imperial gallons are
distinct; SI prefixes use powers of 1000 and binary prefixes use powers of 1024.
Results use JavaScript finite numbers and display up to 12 significant digits,
with scientific notation for very large or small magnitudes to keep results bounded.
From/to pickers share a row to fit the 2×2 footprint.
Empty/invalid/overflowing inputs have no result; temperatures below absolute zero
are rejected. Input and choices are not persisted. Conversion factors and
temperature relations were checked against [NIST SP 811 Appendix B.8](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8),
[NIST revised foot/area factors](https://www.nist.gov/pml/us-surveyfoot/revised-unit-conversion-factors),
and [NIST SI and binary prefixes](https://www.nist.gov/pml/special-publication-330/sp-330-section-3).
Units use the international foot, international acre and avoirdupois pound.
All implementation code is original; no third-party libraries or assets were added.

Note declares a single `storage` record named `default`, with `values.note` as
plain text up to 5,000 UTF-16 units. Its optional title remains the renderer-owned
`settings.title: ["…"]` display preference (40 UTF-16 units, one line, trimmed).
The settings modal uses the shared record REST API and can save content and display
settings atomically. Missing/empty titles show only the widget name; long titles
are truncated beside the action icons. See [Widget storage](Widget_Storage.md).

Edit notes in the widget settings modal, which previews the draft. Save persists
through REST; Cancel discards it. A failed/conflicting save preserves the editor
draft without overwriting the stored note. The card uses its available body height
for the note and offers the full-text modal only when the entire note does not fit.
Resizing and edits re-evaluate the condition. Newlines are preserved and HTML is escaped.
There is no Markdown execution, sharing, attachment support or automatic saving.
Note contents are never included in catalogue definitions or approval audit logs.

The owner initially requested reducing the unpublished combined timer to one 2×2
size. `api/scripts/resize-timer-widget.mjs --apply` accepts only the exact known
earlier three-size definition and valid digest, then updates the definition/digest,
normalizes active instances to `small` and advances affected layout revisions.
It preserves approvals, instance IDs, settings, order and unrelated releases.
Back up the database and stop API writes first; the default is a dry-run rollback.
Normal catalogue refresh still rejects changed content at an existing version.

The final requested split uses `api/scripts/split-timer-widget.mjs`: only the exact
known combined 2×2 definition is accepted, and existing `sph.timer` instance IDs,
settings, approvals and `small` selections remain, with a Timer-only 1×2 definition.
Affected layout revisions advance. Stopwatch (`sph.stopwatch`) is registered as a
new 1.0.0 release via ordinary catalogue refresh and administrator approval.
`combined-timer-metadata.json` retains only the exact earlier public metadata for
these guarded maintenance stages. No running measurement state is persisted.

The same owner-requested one-size maintenance for Unit converter and Personal
note is in `api/scripts/resize-unit-converter.mjs` and `resize-personal-note.mjs`.
Both default to rollback, accept only their exact known earlier definitions/digests,
normalize active sizes to `small`, preserve note text and approvals, and advance
affected layout revisions. Back up and stop API writes before applying.

After the note's single-size stage, `api/scripts/extend-personal-note-sizes.mjs`
accepts that exact 2×2 definition and adds `compact` (1×2). It preserves all existing
note texts and `small` selections and advances affected layout revisions. Each
maintenance script defaults to rollback and rejects unknown definitions/digests;
use only the stage matching the saved installation, after backup and with API writes stopped.

The add previews for these four tools use the current grid's actual body width
and height, subtracting the same border, padding and header as a real card. Compact
timing/converter previews use natural height. When the modal is narrower, a transform
scales the whole preview without reflowing controls at an artificial width. The
modal reserves scrollbar space to keep the preview width stable. Each interactive
preview remains isolated from existing cards. Other widget renderers are unchanged.

The add modal's widget picker uses the widest catalogue label's natural text width,
including provider/version, instead of a fixed 320px maximum. An inert hidden sizer
uses the real font and all labels, so translations and font loading update it
without character-count approximations. Selection and menu rows never wrap.
The picker stays within available width beside the size control; narrow screens
use single-line ellipsis and do not create horizontal page scrolling.

The subsequent requested footprint revision uses
`api/scripts/resize-timing-widgets.mjs`: only the exact dedicated Timer/Stopwatch
2×1 definitions, the intermediate 2×2 Timer, or the current definitions are accepted.
Timer now offers only `small` (1 row × 2 columns), Stopwatch only `small` (2×2). Release IDs, approvals, instance settings and size IDs
are preserved. Affected layout revisions advance once, even when both widgets
share a layout. Unknown definitions/digests fail and roll back.

Timer places the time display and actions side by side on desktop to fit one row.
On phones they stack at natural height. Its status line shows guidance, invalid
duration feedback or completion. Stopwatch always reserves a visible lap region;
a bordered placeholder explains how to record the first lap, then yields to the
list and returns after reset.

The note widget is named メモ / Note. When empty, its entire body is a dashed,
bordered placeholder using the same spacing, border and text colors as the empty
stopwatch lap area. Entered notes retain the existing text and overflow behavior.
The explicit local `api/scripts/rename-note-widget.mjs` maintenance accepts only
the exact preceding 個人メモ / Personal note definition or the current definition,
preserves all instance data/size IDs and approvals, and advances affected layout
revisions. It defaults to rollback; back up and stop API writes before applying.
The historical size-maintenance stages keep their original names for strict
definition matching and recognize the final bundled definition without downgrade.

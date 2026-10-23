# Advanced search and personal saved filters

The employee, book and IT asset catalogs have a search area above the data card. The existing
registration actions, columns, sort controls, page sizes, and pagination remain in
the data card. Other lists retain their existing search behavior. IT asset specifics are documented in [IT asset search](IT_Asset_Search.md).

## Using the search area

Team selectors show names and use surrogate IDs. Internal automatically allocated
team codes are not search fields or option-search terms. Consolidated m0031
creates filters using the current ID-based format from the start. Legacy
explicit team-code predicates require replacement with name-based team selection;
they are rejected rather than silently changing their meaning.

Employees, books and IT assets automatically update the list when keywords, individual fields, condition
expressions or quick filters change. Changes are debounced by 250ms; a new search
resets pagination and supersedes older requests. There is no Search button or applied-condition summary.
These pages have a search-card header with **Simple search**, **Advanced search**, and
**Saved filters** tabs, in that order. The initial tab is Simple search. Tab changes
are saved separately per target and employee ID in
the current browser and restored on return or reload; unavailable browser storage
does not prevent switching. Arrow keys, Home and End also select tabs. Switching
preserves conditions without running another search. A header button
collapses/expands both the search body and its shared action footer.
Its state is saved per employee in the browser and restored on return and reload.
The default is expanded; selecting a tab expands the body and footer.

The employee Advanced search tab groups basic, contact, organization/employment,
created/updated, and keyword/quick filters into category tabs. Only the selected category is shown. Category selection
is saved per employee in the browser; switching preserves all draft conditions.
The account and expressions/related-data categories are omitted. A previously
saved selection of a removed category falls back to basic information. Existing
saved account, related-data, and compound conditions remain applied and are
preserved when editing other fields; Clear removes them.
Tabs show condition counts and support arrow keys, Home and End. The category
input area grows with its content without an internal vertical scrollbar. The
search card expands as fields wrap; scrolling outside the
card keeps all fields, footer actions, and results reachable. Individual inputs use fields permitted
by the existing field API. Date and datetime inputs have inclusive From/To bounds;
one bound may be omitted. Age also uses inclusive numeric From/To bounds, including
one-sided bounds; an existing exact-age filter displays the same age at both
ends. Other numeric fields and choices use equality. Blank inputs add no condition.
Text inputs use contains. All categories use compact input widths appropriate
to each item, wrap as needed, and do not stretch across unused card space. Individual
field categories have no repeated category heading or enclosing group border.
Labels use the same secondary color, support size and regular weight as the Skill/
Team quick filters, including the age unit. Quick-filter single/multiple selectors
share the participation selector's appearance and interaction states. Entered values and empty-control text share their colors across
all tabs. Free text and numeric inputs, keywords and saved-filter names show
localized examples as placeholders; examples never become search conditions.
Range inputs share one field label and separate the bounds with an ASCII hyphen;
bound names remain accessible to assistive technology. Text and numeric inputs use
the common FormInput styling. DatePicker also supports datetime selection with a
calendar, time input, and Apply action; datetime drafts do not change conditions
until confirmed, and use the personal time zone. Applying saved filters retains
AND/OR and all existing permitted related-data conditions, including conditions
that cannot be represented by the individual inputs.
Keywords and quick filters share state across both search tabs. Employee retired/
deleted visibility controls are in the search card, including the keyword/quick
filters category. The employee result-card header has no explanatory subtitle.
The default All branches option uses the same placeholder appearance as other
unspecified quick filters; specific branches retain the normal selected-value color.
Visibility checkboxes sit beside the selectors when space permits. All inputs and actions wrap
to fit narrower viewports without horizontal page scrolling.
Keywords and quick filters share a single wrapping layout, so wrapped checkboxes
can use the full card width below the keyword input rather than staying indented.
Secret hashes, internal IDs, and deleted-record timestamps retain their existing exclusions.
Book Advanced search categories are Bibliography, Copies and locations, Loans and
reservations, Purchase requests (when authorized), Created and updated, and
Keyword and quick filters. Bibliographic inputs use the same
typed controls as employees, including explicit unspecified/Yes/No choices for
booleans and equality for total copy counts. Related categories edit whole related
groups: conditions within one group match the same copy, loan, reservation, or
purchase. Separate groups can match different records. Complex saved predicates
are preserved without flattening OR groups when other inputs change; Clear removes
them. The Expressions and related data tab is omitted from all pages and must not
be introduced in future search configurations. A previously stored selection of
that removed category falls back to Bibliography on books.
Category selection is stored separately per page and employee. The keyword and
purchase-request checkbox share state between the simple and advanced tabs. **Clear** resets
the keyword, conditions, quick filters, and selected saved filter; it does not
remove the server-enforced viewing scope.

The condition editor has categories, fields, typed values, and allowed operators.
Groups can match all (AND) or any (OR). A related-record group specifies **a related
record matches** or **no related record matches**. Conditions inside that group
apply to the same record. For example, TypeScript plus proficiency 3 must match
one employee skill record, rather than TypeScript at level 1 and Python at level 3.
Create separate related groups when different records must each match.

Search covers current, non-deleted records. Completed project participations are
current business records and remain searchable. Returned assets, released software
assignments, removed installations, ended software usage, returned book loans,
inactive reservations, completed purchase processes, change histories, and audit
logs are excluded from detailed related conditions. The pre-existing employee
deleted-record toggle remains available for simple searches; detailed conditions
and that toggle cannot be combined.

Dates are calendar dates. Age, service months, participation status, and relative
calendar-date conditions use the business date in Asia/Tokyo. Datetime inputs use
the user's time zone and are sent as explicit UTC instants. Relative datetime
periods use the user's local calendar-day boundaries, including daylight-saving
changes. Relative conditions are reevaluated whenever a search runs.

Book copy counts state whether they cover all branches. The copy/location group
can constrain the branch and test availability in that branch. Availability
considers usable copies, active loans, and held reservations in each active
location; both catalog output and detailed filtering use the same SQL predicate
before counting or paging.

## Saving and reusing a filter

### Shared selectors and branch inventory counts

Employee branch and team selectors share one state between Simple search and
Organization and employment. Both support multiple values and store new selections
once in `definition.options.branchIds` / `teamIds`. Applying a saved filter converts
a single standalone positive `selection` equality/inclusion only when its meaning
is identical. Conflicting, repeated, OR and compound related predicates remain
unchanged; the field explains when additional saved predicates also apply. Editing
the shared selection never deletes those additional predicates. Visibility toggles
and detailed employment-status rules retain their distinct meanings.

Book Copies and locations includes a `branchCopies` related group with exactly two
rules under `mode: all`, `match: some`: `selection eq <branch ID string>` and
`copyCount` with `eq/ne/gt/gte/lt/lte/between` and nonnegative safe integers. Counts
include loaned and non-rentable copies in active storage, rooms and branches;
deleted copies/locations are excluded. Zero matches titles with no copies in that
branch. Multiple groups can constrain different branches. Global copy counts keep
their previous definition. Branch references are validated on search and saved-filter
reuse; paging and CSV execute the same predicates.

**Save this search** saves the conditions actually applied to a successful search,
including a successful search with zero results. Saving is disabled while loading,
after an error, or while an automatic update is pending. For both pages, the shared
card footer contains Save this search and Clear in every tab while expanded.
Collapsing hides both the body and footer; selecting a tab restores both.
Save opens the Search condition save dialog with new/update mode and name input;
Enter also saves. Save results appear only at the top of the save dialog, which
stays open after success. Saving identical values again is disabled until editing
resumes; editing clears the notice. Close, X, and Escape discard success/error
notices instead of moving them to the search card. Rename/delete results appear
only at the top of the search body and clear on tab changes, collapse, Clear,
page navigation, or the next operation. Opening a dialog also clears old notices.
Clear cancels queued updates and resets all search controls and
the selected filter without deleting stored filters. The Saved filters tab contains
responsive name cards with edit/delete icons, without a selector or reload button.
Names use the normal body font and size, regular weight (400), and text-secondary
color; selection is indicated by the card background and border.
Clicking a name fetches and applies its saved conditions, including re-clicking the
selected filter. Editing renames the card inline; deleting retains confirmation.
The card list grows with its content without an internal vertical scrollbar,
including when inline rename forms open. All cards share the tallest card's height
across rows, adapting to names and viewport width.
Books use the same save dialog and saved-filter cards as employees.
Choosing a saved filter restores the conditions, keyword, sort, and page size,
then fetches current results. Selecting a saved filter replaces the current controls and runs a fresh search.

Logical deletion retains confirmation before deletion. The shared save dialog returns focus to its trigger.
Opening employee/book details preserves the originating search and page.
Employee and book CSV exports use the applied search and its ordering across all
pages, even if the input controls have subsequently been edited. Requests use
500-row pages and freeze the search definition, visible-column search and sort at
export start. Later edits cannot change subsequent export requests. A failed or
incomplete fetch produces no partial download. Both pages use csv-export.ts and
CsvExportButton for BOM-prefixed UTF-8, CRLF rows, quote/newline escaping, formula
neutralization, download cleanup and button appearance. Buttons are disabled while
exporting or while no successful current search result is available.

Employees retain their management-only export and server-provided column metadata.
Books can be exported by readers through the existing authorized book-search API.
Book CSV columns are catalog code, title, author, publisher, edition, ISBN, notes,
copy count and rental availability. Headers and availability values use the display
language at export start. The filename is books-YYYY-MM-DD.csv. Empty results export
only the header; cover images and internal database IDs are excluded.
The purchase-request checkbox sits on the same row as the keyword input when space
permits, aligned with the input itself in both Simple search and Keyword and quick
filters. It wraps on narrow screens.

Saved filters are personal. Even system administrators cannot read or change
another employee's saved filters. A filter saves no result IDs, totals, page
offset, panel state, or authentication data. Names contain 1–100 characters after
trimming. Duplicate names are allowed, including exact matches and names that
differ only in case. Each new save creates a separate filter with a generated
unique filter code and an integer ID; deleted filters are never revived by name.
Each employee may have 32 active filters per target. Updates, renames, and deletes
remain available at or above the limit. Existing records above 32 are preserved;
new saves are refused until the active count drops below 32.
A 409 response with `error.code: FILTER_LIMIT_REACHED` displays the dedicated
Japanese message: 「保存件数が上限に達しています。保存済みフィルターを削除することで新規保存が可能になります。」
The save dialog preserves the entered name and conditions and clears this notice
on close. Revision conflicts use a separate message.

## Shared frontend components

SearchPanel owns the three tabs, 250ms automatic updates, saved-filter cards,
save dialog, shared footer and per-target/per-employee browser state. SearchFields
owns category tabs, typed individual inputs and related-record editors.
search-field-inputs.ts maps individual inputs to predicates without changing
unrepresented expressions. search-configurations.ts supplies page-specific field
endpoints, root contexts, category definitions, widths and example keys; it uses
only the authorized field definitions returned by REST. New pages can reuse these
components by supplying a configuration, the page's search state, and an optional
quick-filter snippet/restore callback. Server endpoint, SearchTarget and saved-filter
support still need to exist for each new target; frontend configuration grants no
permissions. Employee and book configuration are exercised by the shared field
tests and the isolated product-Docker search suite.

## REST API

All resources require a valid server-side session. Write-method requests retain
the existing Origin guard. Responses use the normal `status` / `responseCode` /
`data` or `error` envelope. Search conditions are JSON request bodies and are never
placed in a browser URL or log message.

| Resource | Methods | Required operation |
| --- | --- | --- |
| `/v1/employee-search-fields` | GET | `employees.read`, with its existing scope |
| `/v1/book-search-fields` | GET | `books.read` |
| `/v1/employee-searches` | POST | `employees.read`, with its existing scope |
| `/v1/book-searches` | POST | `books.read` |
| `/v1/search-filters?target=employees\|books` | GET | `search_filters.read` and target read |
| `/v1/search-filters` | POST | `search_filters.create` and target read |
| `/v1/search-filters/{id}` | GET / PATCH / DELETE | Corresponding `search_filters.read/update/delete` and target read |

Field definitions contain only permitted contexts and fields, allowed operators,
localized names, scopes, and permitted master selections. Additional related
resource and sensitive-field operations are checked again when parsing a request.
Unsupported scopes, fields, operators, types, or deleted/inaccessible selections
are rejected rather than silently removed. Related absence checks use the same
visibility restrictions as positive checks. Private settings, account fields,
widgets, and personal reservations cannot match other employees, including with
negative conditions or OR groups. Purchase reasons use the existing owner/branch
responsibility policy. Loan borrowers use the existing owner/manager branch policy.
Secret hashes, credentials, encryption metadata, license key values, and partial
key values are excluded. Public key metadata is searchable through the current
software read policy.

Example search body:

```json
{
  "definition": {
    "schemaVersion": 1,
    "keyword": "",
    "conditions": {
      "kind": "group",
      "mode": "all",
      "children": [{
        "kind": "group",
        "context": "skills",
        "match": "some",
        "mode": "all",
        "children": [
          { "kind": "rule", "field": "name", "operator": "eq", "value": "TypeScript" },
          { "kind": "rule", "field": "record.proficiency", "operator": "gte", "value": 3 }
        ]
      }]
    },
    "sortBy": "employeeCode",
    "sortOrder": "asc",
    "limit": 100,
    "options": {}
  },
  "offset": 0
}
```

The maximum request body is 64 KiB, the maximum rule depth is 3 (root group is
depth 0), and at most 50 rules and 100 selected values are accepted. A defensive
150-node limit also bounds empty groups. Keywords/string search values are at most
500 characters, additionally bounded by the field's business limit. Numeric/date
`between` includes both bounds. Date/datetime `relative` takes two inclusive day
offsets, such as `[0,30]`. The datetime end boundary is the start of the following
local day. Unset strings include NULL, empty strings, and whitespace-only values.
String equality is case-insensitive; contains treats `%`, `_`, and backslashes as
literal text. A negative scalar condition includes an unset value. Relation
absence is expressed with a `none` group, not by negating a security guard.

The search body may include `includeColumns` for the existing authorized employee
CSV output and `visibleSearch` / `searchLocale` for its existing displayed-column
keyword behavior. These request-only controls are not persisted in a filter.
Quick options retain the existing employee visibility, branch/team/workforce
filters and book purchase-request filter. Existing GET employee/book-title clients
remain compatible and reuse the same list services. Every paged order has an ID
tie-breaker.

Filter creation accepts `{target,name,definition}`. PATCH accepts `{revision,name}`
and/or `{revision,definition}`. Owner, target changes, and arbitrary extra input
are rejected. An old revision or limit conflict returns 409 with distinct error codes.
Names are display labels; GET/PATCH/DELETE continue to identify filters by ID.
Unauthenticated requests return 401; missing operations return 403; invalid
conditions return 422; another owner's filter ID returns 404. Retrieving a saved
filter revalidates its current field permissions and selections before reuse.

Consolidated migration `m0031` adds `saved_search_filters`, owner FK with Restrict, management
timestamps, a unique `filter_code` independent of the display name, and an update-time
trigger. It adds four individually configurable operations for the five initial
roles, without changing custom roles or unrelated grants. The existing branch-role
session normalization recognizes those four global grants because the resources
are owner-scoped; resource reads retain their existing scopes. In particular,
this does not create a new global book-read grant for a branch-limited role.
The owner row is locked when mutating filters to serialize the 32-filter limit,
concurrent updates, and employee deletion. Employee logical
deletion invalidates their filters. Audit records contain only resource IDs and
operation names, with no condition bodies or filter names.

## Search inventory and verification

`api/src/lib/server/api/search-registry.ts` is the explicit allowlist, not a runtime
database-field explorer. `docs/search-field-coverage.json` maps every current
Employee field/relation and the scalar fields of the inspected related models to
their search definitions or reviewed exclusions. It also records source paths,
types, operators, scopes, and current-record restrictions. The development
coverage check fails if a schema or registry change is not reflected in that
reviewed inventory. It never automatically publishes a new schema field.

Run the coverage, dedicated-database API, migration, and product-Docker browser
checks described in `development/README.md` in the parent workspace. The browser
test uses real sessions for initial and custom roles and leaves screenshots under
the parent `TEMP/` directory. No new dependencies or third-party material are
included by this feature.

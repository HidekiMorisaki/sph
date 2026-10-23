# IT asset search

`/it-assets` uses the same Simple search, Advanced search and Saved filters card
as Employees and Books. Changes apply automatically after 250ms, reset the page,
and cancel older requests. Desktop page sizes remain 10/20/30/40/50 (default 10);
compact layouts use 20. The existing asset table, registration, details,
assignment/return and credential actions remain available under their own guards.

## Fields

- Simple search shares the keyword, type selection, storage branch and unassigned
  checkbox with the Advanced search quick-filter category.
- Advanced categories: Basic information; Hardware; Location and current assignee;
  Network; Created and updated; Keyword and quick filters.
- Basic fields: asset tag, model, serial, status, purchase/disposal dates, notes.
- Hardware: manufacturer, CPU, operating system and RAM.
- Location/assignee: room, storage, current assignee name/code and assignment time.
- Network: hostname and groups of IP-address/slot conditions. Each IP group matches
  one current IP record; separate groups can match different records.
- Calendar date ranges are inclusive; datetimes use personal time-zone controls.
  Saved AND/OR and related groups remain intact when other inputs change.
  No Expressions and related data category is added.

Passwords, encrypted credential material, credential metadata, internal technical
identifiers, changes, returned/deleted assignments, deleted assets/IPs and software
relations are excluded. The only employee attributes are the safe name/code of
the current asset assignee. Retirement alone does not end that assignment.

## REST and permissions

- `GET /v1/it-asset-search-fields` returns allowed fields, scoped reference choices,
  schema limits and the caller's existing saved-filter operations.
- `POST /v1/it-asset-searches` accepts the common schemaVersion 1 definition plus
  offset and visible-column keyword metadata. Sorts, fields, operators, value
  types, reference IDs, body size and condition depth/count are allowlisted.
- `definition.options` accepts `typeIds` (distinct positive IDs, CSV, at most 100),
  `branchId` (positive ID as a string) and `unassigned` (boolean). Unassigned uses
  the same active-assignment and JST disposal-date predicate as Asset Overview.
- Standard JSON/HTTP status conventions and no-store apply. `assets.read` and its
  global/own_branch scope are enforced by the server. Foreign branch access is
  denied; scoped room/storage/reference options do not reveal other branches.
- Existing `GET /v1/it-assets` remains compatible and uses the same list service.

Personal saved filters use `/v1/search-filters` with `target: "assets"` and the
existing read/create/update/delete operations. An asset-read-only role can search
without master-read or filter permissions. Ownership, revisions, soft deletion,
audit records and the 32-active-filters-per-owner/target limit are unchanged.
Other employees cannot read or change these filters. Denied access and invalid
definitions are rejected even when requests bypass the UI.

## Asset Overview and browser preferences

`unassigned=true`, `typeIds` and `branchId` from Asset Overview initialize the
shared quick filters. They take precedence over the old saved type preference.
Editing them or applying a saved filter updates the URL without navigation;
Clear resets keywords, detailed conditions, quick filters and saved selection,
and removes the dashboard URL conditions. Clear never removes the server scope.
The previous summary strip is replaced by the visible search controls.
Normal type changes preserve the existing browser preference; dashboard or saved
filter application does not overwrite that preference automatically.

## Migration

User-approved `m0032` widens only `saved_search_filters_target_check` to include
`assets` alongside `employees` and `books`. It does not recreate tables, change
existing filter records, add roles or grant permissions. Apply it with the
independent migration job before starting the updated API/frontend.

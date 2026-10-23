# Asset Overview / 資産状況

`/asset-overview` displays current unassigned IT assets in the Dashboard group.
The existing `/it-assets` page remains the asset management list.

## Eligibility and scope

An asset counts when `deleted_at IS NULL`, it has no assignment with both
`returned_at IS NULL` and `deleted_at IS NULL`, and its disposal date is absent
or later than today's JST date. A retired employee's unreturned assignment still
counts as assigned. Future disposal dates remain eligible until that day.
Status names do not determine disposal eligibility.

`assets.read` is required. Global grants cover all branches; `own_branch` grants
restrict assets by their storage's branch. Missing authentication returns 401;
missing permission or an explicitly requested branch outside scope returns 403.
The server enforces these checks before reading data. Sidebar visibility is only
a convenience and is not authorization.

## REST

`GET /v1/it-asset-summary` returns the standard `status` / `responseCode` / `data`
envelope. Data contains:

- `asOf`: current JST date, `YYYY-MM-DD`.
- `scope`: `global` or `own_branch`; `branchId`: null or the authorized branch ID.
- `total`: count of eligible assets.
- `types`, `branches`: `{ id, name, count }` rows, in master order and only for
  groups with matching assets. Each array's count sum equals `total`.

Counts use one repeatable-read transaction. No asset credentials or employee
details are returned. Responses use `Cache-Control: private, no-store`.

`GET /v1/it-assets` additionally accepts:

- `unassigned=true`: applies the same eligibility predicate, including disposal
  exclusion. `false` or omission preserves the normal list's assignment behavior.
- `branchId`: optional positive safe integer, intersected with authorized scope.

Duplicate or invalid values of these parameters return 422. Existing type,
search, sorting and pagination parameters remain supported. The filters apply
to Prisma, visible-field SQL search, and assignee-sort SQL paths equally.

## Drilldowns

The total opens `/it-assets?unassigned=true`; type and branch rows add `typeIds`
or `branchId`. The URL survives reload and filtering. Incoming dashboard type
conditions take priority over the saved type preference, without changing it.
The list reflects these conditions in its shared search card. Clear resets the
keyword, detailed conditions and quick filters, without changing the server scope.
Dashboard conditions do not overwrite the previous type preference. Counts are live; later asset
changes or a new JST day may change the matching list.

The page supports Japanese/English, light/dark themes, narrow layouts, loading,
zero, permission-denied and retry states. Historical snapshots, long-unassigned
thresholds and PDF output are outside this feature.

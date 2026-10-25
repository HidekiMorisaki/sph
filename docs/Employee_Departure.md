# Employee departure and asset returns

An employee retirement date change opens a confirmation dialog before saving the
employee form. Deletion opens the same confirmation workflow with a deletion date.
The dialog lists unreturned IT asset assignments and book loans. The operator must
confirm receipt of the physical items; nothing is marked returned on opening or
cancelling the dialog. Software licences and book reservations are outside the
physical-return list.

Returns take effect immediately, including for a future departure date. The return
date must be on or after allocation/loan, no later than the Japan business date,
and no later than departure. Retirement/deletion dates cannot precede hire. A
departure date in the past is a business date, not a backdated processing timestamp.

## REST and authorization

- `GET /v1/employees/{id}/departure` previews the current assignments and loans.
  It requires employee read and update or delete access, system-administrator
  protection, and permission to return every listed item in its branch.
- `PATCH /v1/employees/{id}` retains its existing update/role/scope checks. Setting
  or changing a retirement date additionally requires `departureConfirmation`:
  `{confirmed:true, assignmentIds:[...], loanIds:[...], returnedOn:"YYYY-MM-DD"}`.
  The confirmation must exactly match the current active records.
- `PUT /v1/employees/{id}/deletion-reservation` requires existing employee delete
  permission and scope. Body: `{deletionOn:"YYYY-MM-DD", confirmation:{...}}`.
  It records returns and the date in one transaction. Dates on/before today delete
  immediately; future dates reserve deletion. The same route changes a reservation.
- `DELETE /v1/employees/{id}/deletion-reservation` cancels a future reservation.
  Recorded returns remain in history. Reservations already due cannot be cancelled.
- The existing direct employee DELETE also refuses outstanding IT assignments or
  book loans. It cannot bypass the asset-return condition.

Each IT return requires `assets.return` and each book return `books.loans.return`,
with the actual item's branch checked. Employee update/delete permission alone
does not grant either. No default-role expansion is performed. Existing last
administrator, protected-employee and branch-responsibility deletion guards remain.

Mismatched confirmations return 409 `DEPARTURE_CONFIRMATION_REQUIRED`; outstanding
assets return 409 `ASSETS_NOT_RETURNED`; missing return scope returns 403
`ASSET_RETURN_PERMISSION_REQUIRED`. Input/date errors use 422. All errors retain
the standard JSON envelope. Transactions roll back all returns, employee changes,
role changes and history on rejection. Employee rows are locked before assets or
book titles; new allocations use the same employee lock. Individual return paths
are serialized through the existing asset/title locks and confirmation is re-read.

## Scheduling and persistence

Migration `m0035` adds employee `deletion_scheduled_on` (business DATE), the requesting
employee FK, and `asset_return_completed_at`. These are separate from `deleted_at`,
which records the actual logical deletion time. Existing rows default to NULL.
Employee identity and existing natural-key constraints are retained.

After departure returns are confirmed, new IT assignments, book loans and book
reservations are rejected. Cancelling deletion releases this block only if no
retirement date remains; clearing retirement releases it only if no deletion is
scheduled. Cancellation does not recreate returned assets.

The API checks due deletions at startup and every 10 seconds. Processing is
transactional and serialized with administrator changes, supports multiple API
instances, retries failures, and catches up after downtime. The scheduled request
is an authorized durable instruction; execution is attributed to its requester.
It rechecks outstanding assets, branch duties and administrator protection before
logically deleting the employee and disabling sessions/invitations/related grants.
No database rows are physically removed.

Login and every session validation independently reject a deletion date on/before
the current Japan business date. Thus access stops at 00:00 JST even if the worker
has not run yet. Invitations and account setup also reject due deletions.
The scheduled date appears in employee employment information and change history.

# Teams and internal identifiers

Teams group employees across branches and departments. Employees may belong to
multiple teams; membership does not grant permissions. Existing REST permissions
and branch restrictions remain unchanged.

PostgreSQL allocates a unique internal code (`TEAM-1`, `TEAM-2`, …) when a team is
created. Existing codes, including codes on logically deleted teams, remain
unchanged and reserved. Consolidated m0031 creates the sequence with the new
table, starting at 1. Concurrent creates cannot share a code; sequence gaps are allowed.

POST `/v1/teams` and PATCH `/v1/teams/{id}` accept name and optional description.
The name is required (128 characters); description is optional (5,000 characters).
Supplying `code`, even null, returns 422. Codes cannot be edited. Active names
remain unique ignoring outer whitespace and letter case; name conflicts return
409 `TEAM_NAME_CONFLICT`. A logically deleted name may be reused by a new team.

Codes are omitted from team and employee REST responses, lists, details, forms,
employee membership history, CSV, selection labels and option search. Lists sort
by name, description, memberCount, createdAt and updatedAt; `sortBy=code` is
rejected. Free-text team/employee search does not match internal team codes.
Team selectors use names and surrogate IDs. Detailed search omits `Team.code`.

Consolidated m0031 creates teams with internal code defaults and the active-name
unique index from the start. Since teams and saved filters do not exist before
m0031, it does not run intermediate code backfills, history-label rewrites or
saved-selector conversions. Legacy explicit code predicates are unsupported
and return a validation error; users must choose teams by name again.

Local checksum-reconciliation tools are not part of released installations.
Released installations use the reviewed release migrations.

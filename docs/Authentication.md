# Authentication behavior

The browser uses the same-origin `/v1/auth/login`, `/v1/auth/session` and
`/v1/auth/logout` REST endpoints. Sessions are validated by the API against
PostgreSQL. Protected and error API responses use `Cache-Control: private, no-store`.

## Failed sign-in attempts

Five failed password attempts for the same account and source within a rolling
15-minute window start a 15-minute restriction. The fifth failure returns 401;
subsequent attempts return 429, including attempts with the correct password.
A source also has a shared budget of 100 failures per 15 minutes across accounts.
Username and email aliases for an existing account share the same counter.
Unknown accounts use the same password-hash work and restriction behavior.
Successful sign-in clears that account/source failure history, but does not clear
the source-wide budget. Requests during a restriction do not extend it.

429 responses carry `Retry-After` in whole seconds and a `LOGIN_RATE_LIMITED`
error. The sign-in page initially explains the 15-minute restriction and then
shows the remaining minutes, rounded up. It clears the password, updates the
countdown locally, and never automatically resends credentials. Reloading or
changing the identifier does not remove the server-side restriction.

Counters are stored in `authentication_throttles` by migration `m0034`, and are
shared across API restarts and replicas. Keys are purpose-separated HMACs of the
source and account, using the existing credential encryption key. Keep this key
consistent across replicas. If the counter store is unavailable, sign-in returns
503 and readiness fails; authentication does not bypass the restriction.
Only the trusted ingress may reach the API. The local gateway replaces untrusted
forwarding headers; adapter-node reads the last forwarded address (`XFF_DEPTH=1`).
When adding another proxy, review its address chain before changing these settings.
Shared NAT users share the source budget. An attacker who knows an account and
shares its source can temporarily block it; this bounded denial-of-service tradeoff
is inherent in the approved account/source policy.

## Retirement dates

A retirement date is a Japanese business date. Access stops at 00:00 Asia/Tokyo
on that date, including existing sessions. Login, invitations, account setup and
last-system-administrator protection use the same date boundary.

## Recovering an experimental cloud deployment

Free hosting can put an idle application to sleep. First inspect the provider's
state: sleeping is distinct from a failed deployment. Resume the existing app,
wait for `/v1/health` and `/v1/readiness` to return 200, then check sign-in, session,
version, a protected page and logout. Confirm the deployed revision stayed the
same. A successful resume does not deploy local fixes or apply new migrations.
Do not enable paid resources or change the sleep policy as part of recovery.
If readiness remains unavailable, diagnose startup, database connectivity and
migration state before rebuilding. Never expose credentials or connection strings
in incident logs. Follow the backup/update procedure for an actual version update.

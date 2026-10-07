# API key design (implementation deferred)

This document specifies a future API key feature. No endpoint or credential is enabled by this design alone.

## Ownership and authorization

- Every key belongs to one active Employee. An authenticated Employee can issue, list, rotate, and revoke only their own keys through session-authenticated `/v1/me/api-keys` endpoints. Creation, rotation, and revocation require a valid same-origin session and a recent password reauthentication. A system administrator may revoke a compromised key through a separately audited administrative endpoint, but cannot reveal its secret.
- A key requests `read` and/or `write` for each explicitly named resource (for example `employees`, `it-assets`, `work-calendars`). No wildcard or implicit scope exists. The server maintains a versioned allowlist mapping every eligible REST operation and HTTP method to one resource and action. New routes are ineligible until mapped and reviewed. Key issuance rejects unknown resources/actions.
- Effective authorization is the intersection of the key's granted scopes and the owner's **current** server-side RBAC permissions, including department/person scope and record visibility. Resolve Employee, active role grants, and resource scope on every request; do not cache permissions across changes. Revoking a role, retiring or deleting the Employee, or changing applicable scope takes effect immediately. Existing route guards and response field restrictions still apply. Credentials, account recovery, role assignment, system settings, key management, and any route without an explicit mapping are never key-accessible.
- A key may narrow access; it never grants a permission the owner lacks. An authenticated key with insufficient scope or current owner permission receives 403. A missing, invalid, expired, or revoked key receives 401 with a generic response.

## Credential lifecycle

- Use a dedicated `X-API-Key` HTTP header. Never accept keys in URLs, request bodies, or cookies. Never include the header or secret in logs, errors, telemetry, audit details, or browser storage. Require HTTPS outside localhost development.
- Generate at least 32 random secret bytes with a cryptographic RNG. Return the complete key only once on creation or rotation, in a response with `Cache-Control: no-store`; show it once in the UI. Store a public key identifier and a keyed digest of the secret, never the secret itself. Compare digests in constant time. A server-side digest key is separately managed and rotated. Document its backup and rotation procedure before implementation.
- Keys have a required expiration, capped at 90 days, and may be revoked immediately. Rotation creates a new key and revokes the prior key atomically. Display only identifier, name, resource scopes, rate limit, creation/expiration/revocation times, and last-used time after initial issuance.
- Use an auto-increment `id`, a unique public technical identifier, and `created_at`, `updated_at`, `deleted_at` on key and usage tables. Revocation sets `revoked_at`; routine removal sets `deleted_at` and never physically deletes a row. Store the issuing Employee reference with `ON DELETE RESTRICT`. Migrations use the next numbered `mNNNN` directory.

## Rate limiting and request handling

- Each key has an hourly ceiling of 1,000 requests by default; the issuer can choose 1–10,000, with 10,000 as the hard maximum. Count all authenticated attempts, including denied operations, in an atomic PostgreSQL counter keyed by key ID and UTC hour. Reject over-limit requests with 429, the standard JSON error envelope, `Retry-After`, and rate-limit headers. Expired counter rows are cleaned by a maintenance job with retention appropriate for audit needs. Add a separate pre-authentication IP/identifier limiter to prevent guessing attacks.
- Resolve session authentication and key authentication as distinct principal types in the API `handle` hook. Reject requests presenting both a session cookie and `X-API-Key` to avoid confused-deputy behavior. For key-authenticated mutations, skip the browser Origin check only after successful header authentication, while retaining HTTPS, content-type, body-size, and route guards. Browser session CSRF checks remain unchanged. The frontend continues to use REST through the gateway.
- Apply the same `responseCode`/`status` JSON contract as other `/v1` routes. Do not expose whether an identifier exists through error details or timing. Limit key-list pagination to the common `sortBy`/`sortOrder`/`offset`/`limit` contract.

## Audit and verification before release

- Audit creation, rotation, revocation, authentication failures, rate-limit rejections, and use of sensitive permitted operations. Record actor ID, key identifier, action, resource, outcome, request time, and minimal request metadata; never store secrets or sensitive payloads. Update `last_used_at` asynchronously or with bounded writes so every request does not contend on the key row.
- Tests must cover same-owner management, key secrecy, expiration, immediate revocation, role/scope changes, tenant/record scope, every allowlisted route, unmapped-route denial, concurrent hourly limits, 401/403/429 envelopes, HTTPS and dual-auth handling, and audit redaction. Verify on an isolated database and through REST before enabling the UI.

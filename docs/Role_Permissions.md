# Role and operation permissions

Each active employee has exactly one active `employee_roles` row. The partial unique index on `employee_id` enforces this in PostgreSQL; the employee API retains a one-item `roleIds` array for `/v1` compatibility. A role can have many operation permissions, stored through `role_permissions` and `permission_operations`.

The editable permission catalogue is returned by `GET /v1/permissions`. Read access remains resource based, while writes and sensitive reads have individual codes such as `employees.update`, `assets.assign`, and `assets.credentials.view`. Role edits select these individual codes. The API derives the legacy aggregate permissions still used by resource and scope guards. Server request handling checks the individual code before invoking the endpoint; the endpoint also checks the resource and target scope. An absent role, inactive role, missing operation, or unsupported scope denies access.

Only system administrators may edit role permissions or change an existing employee's role. Business and branch administrators may create an employee with the General User role. The System Administrator and Branch Administrator roles remain protected. The latter is assigned with `own_branch` scope. On new installations it can update only its own branch and has no branch deletion permission. Existing database grants are not revoked by this change. Global and own-branch scopes are currently effective. Department and individual scope fields are retained for future support but do not grant access in the current session evaluator.

## Migration

The v0.3.0 migrations remain unchanged. The v0.4.0 schema and data changes are consolidated in `m0016`. It preserves existing records while assigning one active role per employee, adding individual operations, and storing each role permission's scope. On a fresh installation, the installer creates the operation catalog and default role grants after migrations complete. PostgreSQL enforces one active role assignment per employee with a partial unique index, and constrains each role permission to `global` or `own_branch`.

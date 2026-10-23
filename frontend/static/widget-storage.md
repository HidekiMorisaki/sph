SDK v2 widgets use this same per-instance REST storage. Code runs in a Worker and calls storage through the host SDK; it does not receive a session or direct database access. See [Widget SDK](Widget_SDK.md). Preview storage is temporary and separate from actual records.

# Widget storage and declarative record UI

This is the storage contract for new v0.6.0 installations. The unpublished m0032
includes `widget_records`. Older development databases and note/time-zone layout
payloads are not supported; recreate the installation with the installer. There
is no data-copy or migration-checksum reconciliation procedure for this change.

## Ownership and database

All widgets use one `widget_records` table. Installing a widget never executes
DDL. Each record belongs to one `widget_instances` row, whose layout belongs to
the signed-in employee. Two instances of the same release have independent data.
The database uses an auto-increment integer primary key and a unique natural key
`(instance_id, record_key)`. JSONB `values` contains the declared data. Records
have positive revisions and created/updated/deleted timestamps; normal deletion
is logical, and deleted record keys cannot be reused. Removing an instance
logically deletes its records in the same transaction.

## Definition

See the complete [ToDo example](examples/widget-todo.json). It is an authoring
example, not an automatically installed official widget. Publish the definition
in a catalogue using the normal source/review/approval workflow. Definition and
licence review are still required. Never change an already approved release in
place; publish a new version instead.

Keep manifest `settings` empty. Add an optional `storage` object:

| Property | Meaning |
| --- | --- |
| `fields` | Map of 1–32 field definitions. Names: lowercase ASCII letter followed by letters/digits/underscores, max 64; `constructor` and `prototype` are reserved. |
| `fieldOrder` | Optional array containing every field exactly once, specifying form order. Without it, the UI uses alphabetical field names. JSON object property order is not retained by JSONB. |
| `titleField` | Existing field shown in the card summary. |
| `listFields` | Nonempty, unique ordered array of existing fields shown in the full list. |
| `operations` | Required `create`, `update`, `delete` booleans. They restrict operations and never grant permissions. |
| `maxRecords` | Optional lower active-record limit, 1–1,000. Default 1,000. |
| `maxRecordBytes` | Optional lower per-record value limit, 1–65,536 bytes. Default 65,536. |
| `maxTotalBytes` | Optional lower active-value total, 1–1,048,576 bytes. Default 1,048,576. |
| `initialRecords` | Optional `{recordKey,values}` entries created atomically with a new instance. They must satisfy all constraints and quotas. |

Every field requires `type` and `label: {ja,en}`. Labels contain 1–160 characters.
Optional `required` and `default` control validation and initial input values.
PUT replaces the complete values object; omitted fields use their defaults or,
if optional without defaults, are omitted from storage. Required fields must be
provided or have a valid default. Unknown fields and null values are rejected.

| Type | Input and constraints |
| --- | --- |
| `string` | Single line; default maxLength 1,000 UTF-16 code units. |
| `text` | Multiline plain text; default maxLength 16,000. |
| `number` | Finite JSON number; optional finite `min` and `max`. |
| `boolean` | JSON true/false. |
| `date` | Real calendar date formatted `YYYY-MM-DD`, without timezone conversion. |
| `select` | String from 1–100 unique `options: [{value,label:{ja,en}}]`. |
| `stringArray` | Up to 1,000 unique nonempty, single-line strings; default maxLength 1,000 per element. The common editor uses one value per line. Optional `format: "timeZone"` validates IANA names with Intl. |

`maxLength` can be set to 1–16,000 for strings, text, select values and array
elements. Strings cannot contain NUL or unpaired UTF-16 surrogates. Required scalar text cannot be blank;
required arrays cannot be empty. Arbitrary nested objects, expressions, scripts,
HTML rendering, external API calls and attachments are not supported.

The `records` view must be the sole block, with empty capabilities/settings and
explicit sizes of at least 2 rows × 2 columns. SPH renders a three-record title
summary, Add and Show list controls, a paged list (10 records on desktop, 20 on small screens) and typed forms.
Create/edit/delete controls follow both manifest restrictions and server-reported
permissions. Shared modals, date pickers and localized labels are used. Save is
explicit; Cancel discards the draft. Failed/conflicting saves retain the draft.

## REST

### Initial values at widget creation

`PUT /v1/employees/me/widget-layout` accepts optional `initialRecords` on a **new**
instance, for example `[{"recordKey":"default","values":{"timeZones":["UTC"]}}]`.
Only keys already declared in the approved storage definition's `initialRecords`
may be replaced. Omitted entries use their approved values; an empty override array
keeps all defaults. Unknown or duplicate keys and extra entry properties are rejected.
Field validation, per-record bytes, total bytes and record-count limits apply.
Note accepts `{"note":""}`; its optional title belongs in `settings.title:[""]`.

Custom initial values require `widgets.read` and `widgets.records.update`, in
addition to `widgets.layout.update`, and the definition must allow updates. They
are rejected on existing instances; later edits use the record API. New instances
without overrides still initialize their approved defaults under the existing
layout permission. Approval/source/release state is checked under shared locks
for customized initialization. Layout updates, instance creation, initial records
and identifier-only audit entries commit or roll back together. Records start at
revision 1, and the layout revision increments once. Overrides are not echoed by
layout GET responses or saved in presentation settings.

`GET /v1/widget-releases` adds `canEditInitialRecords`, derived from effective
read/update permissions, active approval and the storage update restriction. The
add modal uses it to disable content controls for users who cannot customize
initial records; the server independently enforces the same requirements.

### Per-instance record operations

Base: `/v1/employees/me/widget-instances/{key}/records`.
Requests use the normal same-origin login session and Origin protection. No
credentials are accepted in URL parameters or bodies. API keys and arbitrary
widget JavaScript are not part of this interface.

| Resource / method | Request |
| --- | --- |
| Base GET | `sortBy=recordKey\|createdAt\|updatedAt`, `sortOrder=asc\|desc`, `offset`, `limit` (1–500, default 100). Values-field sorting is not supported. |
| Base POST | `{ "recordKey": "optional-key", "values": {…} }`. Omitted key is generated. Returns 201. |
| `/{recordKey}` GET | Returns one active record. |
| `/{recordKey}` PUT | `{ "revision": 1, "values": {…} }`. Full replacement, not a partial patch. |
| `/{recordKey}` DELETE | `{ "revision": 1 }`. Logical deletion, returns 200. |

Keys contain 1–64 ASCII letters/digits/hyphens/underscores, beginning with a
letter or digit. All responses use the standard HTTP/`responseCode`/`status`
envelope. A record contains `recordKey`, `values`, `revision`, `createdAt` and
`updatedAt`. GET of one record also reports `operations`; list GET reports
pagination and `operations` in `meta`. Private GET responses use `no-store`.

Writes require the `widgets.records.create`, `.update` or `.delete` operation,
plus `widgets.read`. Reads require `widgets.read`. New default roles with widget
layout access receive record operations. Ownership is enforced even for system
administrators. Disabled instances, stopped approvals and deleted sources or
releases cannot use the storage APIs. Other owners' instances/records return 404.

| HTTP status | Examples |
| --- | --- |
| 400 | Invalid key/body/revision, undeclared field, wrong type, invalid values, per-record capacity violation, no storage definition. |
| 401 / 403 / 404 | Missing authentication / insufficient permission or stopped/disabled operation / unknown or another owner's resource. |
| 409 | Stale record/layout revision or previously used record key. |
| 413 | Encoded request body exceeds 96 KiB. |
| 422 | Invalid list query or active-record count/total-byte limit. |

Capacity is the UTF-8 byte length of `JSON.stringify` of validated values,
including filled defaults; record metadata is excluded. Active records count
toward quotas. Logical tombstones remain stored and are not physical cleanup.
Capacity checks and writes are serialized per owning layout/instance to prevent
parallel requests from exceeding limits. Audit logs contain identifiers and
operation names, not saved values.

PUT can atomically save a record and its own instance's presentation:

```json
{
  "revision": 1,
  "values": {"note": "Private text"},
  "presentation": {
    "layoutRevision": 3,
    "size": "1x2",
    "settings": {"title": ["My note"]}
  }
}
```

This additionally requires `widgets.layout.update`. Both revisions must match;
any failure rolls back both changes. Success includes `layoutRevision`. A
record-only update increments only the record revision. A display-only edit uses
the layout API. Record schemas are fixed by the approved release; there is no
automatic conversion to a new version's schema or cross-instance data sharing.

## Built-in storage

Note initializes record `default` with `values: {note: ""}`. Its plain-text value
has a 5,000 UTF-16-unit limit. World clock initializes record `default` with
`values: {timeZones: ["Asia/Tokyo"]}`. At least one valid, unique zone is required.
Both have one record, allow updates and disallow record creation/deletion.

Their settings modal reads/writes the same record API. Note title, clock design,
size and order remain presentation settings. The layout API neither accepts nor
returns note text/time-zone arrays in `settings`. The existing data endpoint
reads these values from `widget_records` for card rendering. There is no fallback
to, or second copy in, `widget_instances.settings`.

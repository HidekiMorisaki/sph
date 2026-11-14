# Software license management

The page is `/licenses`; REST resources use `/v1/software-*`. Products, contracts/purchases, usage terms, keys and assignments are separate records. Conditions and remaining capacity are not pooled across contracts for the same product.

## Counting

- User-based contracts count each active assigned Employee once. Capacity is `purchased quantity × users per license`.
- Device-based contracts count each active assigned IT asset once. Capacity is the purchased quantity.
- A contract cannot have duplicate active assignments to the same target. Releasing an assignment frees capacity and retains history; later reassignment is allowed.
- Remaining capacity is `max(0, capacity − assignments)`; excess is `max(0, assignments − capacity)`. Assignment locks the contract row and rejects new assignments beyond capacity.
- Concurrent-use contracts can be registered, but compliance remains pending without measured usage; remaining/excess counts are not calculated. Unverified evidence for usage terms is marked as requiring confirmation.

## Installations and actual users

- User- and device-based contracts can record installations on active registered IT assets, with multiple active registered Employees as actual users. Installation and user records have start/end dates and retain history. Duplicate active contract/device installations and installation/employee user records are rejected.
- These records describe actual use and can be recorded even when assignments or limits are insufficient. Ending an installation ends its active user records on the same date. A later installation on that device can be recorded again.
- Devices per user are checked against distinct active IT assets with active user records for that Employee in the contract. Users per device are checked against the active Employees on each installation.
- Contract details show active installations, user records, mismatches with assignments, and devices/users exceeding limits. Missing usage records for an assigned target require confirmation; absence of records does not establish compliance. These are not automatic checks against devices or vendor activation services.

## Administration and protection

- Assignment targets must be active registered Employees or IT assets. Contracts outside their active period and targets inconsistent with the counting unit cannot receive assignments.
- The UI shows contracts expiring or renewing within 30 days and overdue contracts. Email reminders are not implemented. Contract/purchase evidence is stored as reference information, without file attachments.
- Key text is encrypted with AES-256-GCM. Ordinary lists expose only the last four characters. Full disclosure requires `software.keys.reveal`, reauthentication with the current password and a secure transport. Disclosure is audited.
- `software.read`, product/contract writes, assignment/release and key write/disclosure are separate operation permissions. Migration grants new operations to the system administrator role; other existing roles require explicit configuration by a system administrator.
- Recording/ending installations and user records also requires separate operations. m0020 grants these to existing system administrators, without automatically extending other existing roles.

Measured concurrent usage, evidence-file attachments and email deadline reminders remain unimplemented.

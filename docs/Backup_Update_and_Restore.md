# Backup, update, and restore

The maintenance tools in `scripts/` are intended for operators of installed SME Portal Hub systems. Run them from a terminal on the computer that hosts the Git checkout and Docker Compose installation.

## Important safety information

- A normal update is one command: `update.ps1` on Windows or `update.sh` on macOS/Linux.
- The update command creates and verifies a complete database backup before it runs `git pull --ff-only` or rebuilds containers.
- A successful update does **not** require a restore. Restoring afterward would replace current data with the earlier snapshot.
- Restore is a destructive disaster-recovery operation. Use it only when recovery from a known backup is required.
- Backups contain employee, authentication, session, history, and logically deleted data. Store them as confidential data, restrict access, and copy important backups to separately protected storage.
- `.env` is intentionally not included. Keep a separate, protected copy of the deployment configuration and secrets.
- In HTTPS installations, also back up the Docker `gateway_data` volume and `.runtime/gateway/Caddyfile` separately. The database dump does not include certificates or the internal CA. Losing the internal CA requires a new client trust deployment.
- The tools do not automatically roll back Git source code. If an update fails after the pull, preserve the backup and diagnose the failure before choosing a source revision or restoring data.
- Never use `docker compose down --volumes` as part of an update.

## Prerequisites

Before running a maintenance command:

1. Start Docker Desktop or the Docker service.
2. Confirm that `git`, `docker`, and `docker compose` are available.
3. Keep the repository's `.env` file in place.
4. Commit or otherwise resolve every local Git change. The update tool refuses to run with a dirty worktree.
5. Configure the current branch with an upstream remote. The update tool refuses to guess which remote branch to pull.
6. Ensure there is enough free disk space for a complete PostgreSQL dump and its restore-verification database.

The default backup location is a sibling of the repository named `sph-backups`. For example, an installation at `C:\projects\sph` writes to `C:\projects\sph-backups`. A backup location inside the Git repository is rejected.

## Update the system

Run the command from the repository root.

Windows PowerShell:

```powershell
.\scripts\update.ps1
```

macOS or Linux:

```bash
./scripts/update.sh
```

To use another backup root outside the repository, pass it as the first argument:

```powershell
.\scripts\update.ps1 -BackupRoot 'D:\Protected\sph-backups'
```

```bash
./scripts/update.sh /protected/sph-backups
```

The tool performs these operations in order:

1. Validates Docker Compose, `.env`, the Git worktree, and the upstream branch.
2. Ensures PostgreSQL is healthy.
3. Stops `gateway`, `frontend`, and `api` to prevent writes.
4. Creates a PostgreSQL custom-format dump containing the complete database.
5. Restores that dump into a guarded temporary database, compares table and migration counts, writes a SHA-256 checksum and manifest, and removes the temporary database.
6. Runs `git pull --ff-only`.
7. Generates the gateway configuration from `.env`, rebuilds services, adopts the consolidated baseline when the verified database has the supported legacy history and matching schema, then starts services and runs the migration job.
8. Waits for the API and frontend health checks and confirms that `/v1/health` reports the version in `VERSION`.

If the update fails before Git changes the checked-out revision, the tool attempts to restart the previous application containers. If a verified backup was created, its location is printed and it is retained. Do not immediately restore it: first inspect the error and container logs.

## Create a standalone backup

Windows PowerShell:

```powershell
.\scripts\backup.ps1
```

macOS or Linux:

```bash
./scripts/backup.sh
```

An optional backup-root argument works the same way as it does for the update command. Each successful backup directory contains:

- `database.dump`: a PostgreSQL custom-format dump of the complete database.
- `manifest.json`: the product version, source commit, UTC creation time, database and PostgreSQL versions, archive checksum, and restore-verification result.

The dump includes application rows, audit/history data, logically deleted rows, authentication data, and Prisma migration history. It does not include `.env`, Docker images, or the Git checkout.

## Consolidated initial schema

The initial schema is now a single migration, `20261003000000_initial_baseline`.
It creates the completed schema with no business data. Only foreign-key constraint
additions use `ALTER TABLE`; columns, keys, checks, functions, indexes and triggers
are created in their final form. Required initialization and optional localized
samples run separately in the installer migration job.

An existing database must not execute the initial SQL again. Update and restore
tools verify the full backup and compare the complete current schema with the
baseline before replacing **only** Prisma's infrastructure migration history.
Application rows, deleted rows, authentication fields and sequence values are
unchanged. The eight supported legacy migration names/checksums are checked;
unfinished migrations, unknown history and schema differences stop the operation.
Prior history is kept in `migration-history-before-baseline.json` beside the
complete backup. Databases already on the baseline are left as they are.

For a supervised development checkout already containing the consolidated source:

```powershell
docker compose stop gateway frontend api
./scripts/backup.ps1
docker compose build migration
# Replace the host path with the verified backup directory just created.
docker compose run --rm --no-deps --volume 'C:\protected\sph-backup:/baseline-backup' migration node scripts/baseline-existing.mjs /baseline-backup/manifest.json
docker compose run --rm --no-deps migration
docker compose start api frontend gateway
```

Do not reset the database or manually edit checksums to resolve a rejected
baseline. Keep the backup, diagnose the difference and leave application services
stopped until a compatible migration plan is available. The existing full backup
can still be restored using a compatible source revision.

## Restore a backup

Restore replaces every row and database object in the configured database. Application services are stopped before replacement. After restoration, current migrations are applied and all restored sessions, password-reset tokens, and account invitations are invalidated. Users must sign in again.

Windows PowerShell:

```powershell
.\scripts\restore.ps1 -BackupPath 'C:\projects\sph-backups\sph-0.1.0-YYYYMMDDTHHMMSSZ'
```

macOS or Linux:

```bash
./scripts/restore.sh /path/to/sph-backups/sph-0.1.0-YYYYMMDDTHHMMSSZ
```

The tool validates the manifest, archive name, SHA-256 checksum, PostgreSQL archive catalog, and configured database name before asking for confirmation. To proceed, type the exact confirmation shown, such as `RESTORE equipment_db`.

For supervised automation, the expected database name may be provided explicitly. This does not bypass any archive or database validation:

```powershell
.\scripts\restore.ps1 -BackupPath 'D:\Protected\sph-backups\sph-0.1.0-YYYYMMDDTHHMMSSZ' -ConfirmDatabaseName 'equipment_db'
```

```bash
./scripts/restore.sh /protected/sph-backups/sph-0.1.0-YYYYMMDDTHHMMSSZ equipment_db
```

If restore fails after database replacement begins, application services are intentionally not restarted. Keep the backup unchanged, inspect the reported failure and `docker compose logs`, and correct the cause before retrying recovery.

## Backup retention

The tools never delete successful backups. Establish a retention policy appropriate for the sensitivity and volume of your data. Periodically test recovery on a separate protected installation, and securely delete expired backup sets according to your organization's data-handling policy.

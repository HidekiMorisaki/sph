#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=maintenance-common.sh
source "$SCRIPT_DIRECTORY/maintenance-common.sh"

destructive_restore_started=false
restore_failure() {
	local exit_code=$?
	trap - ERR
	if [[ "$destructive_restore_started" == true ]]; then
		echo 'The destructive restore started, so application services were intentionally left stopped unless recovery completed successfully.' >&2
	fi
	exit "$exit_code"
}
trap restore_failure ERR

[[ $# -ge 1 && $# -le 2 ]] || { echo 'Usage: ./scripts/restore.sh BACKUP_DIRECTORY [DATABASE_NAME]' >&2; exit 2; }
cd "$SPH_REPOSITORY_ROOT"
assert_maintenance_prerequisites
backup_directory="$(cd "$1" && pwd -P)"
manifest_path="$backup_directory/manifest.json"
[[ -f "$manifest_path" ]] || { echo 'The backup manifest is missing.' >&2; exit 1; }

format_version="$(sed -n 's/^[[:space:]]*"formatVersion":[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$manifest_path" | head -n 1)"
application="$(manifest_string "$manifest_path" application)"
archive_format="$(manifest_string "$manifest_path" archiveFormat)"
archive_file="$(manifest_string "$manifest_path" archiveFile)"
expected_hash="$(manifest_string "$manifest_path" sha256)"
manifest_database="$(manifest_string "$manifest_path" databaseName)"
verified_restore="$(sed -n 's/^[[:space:]]*"verifiedRestore":[[:space:]]*\(true\|false\).*/\1/p' "$manifest_path" | head -n 1)"
[[ "$format_version" == 1 && "$application" == 'SME Portal Hub' && "$archive_format" == 'postgresql-custom' && "$verified_restore" == true ]] || { echo 'The backup manifest is invalid or was not restore-verified.' >&2; exit 1; }
[[ "$archive_file" =~ ^[A-Za-z0-9._-]+$ ]] || { echo 'The backup archive name is invalid.' >&2; exit 1; }
[[ "$expected_hash" =~ ^[0-9a-f]{64}$ ]] || { echo 'The backup archive checksum is invalid.' >&2; exit 1; }
archive_path="$backup_directory/$archive_file"
[[ -f "$archive_path" ]] || { echo 'The backup archive is missing.' >&2; exit 1; }
[[ "$(sha256_file "$archive_path")" == "$expected_hash" ]] || { echo 'The backup archive checksum does not match its manifest.' >&2; exit 1; }

assert_database_ready
get_database_identity
[[ "$manifest_database" == "$SPH_DATABASE_NAME" ]] || { echo 'The backup database name does not match the configured target database.' >&2; exit 1; }
if [[ $# -eq 2 ]]; then
	confirmation="RESTORE $2"
else
	printf 'This replaces all data in %s. Type RESTORE %s to continue: ' "$SPH_DATABASE_NAME" "$SPH_DATABASE_NAME"
	read -r confirmation
fi
[[ "$confirmation" == "RESTORE $SPH_DATABASE_NAME" ]] || { echo 'Restore confirmation did not match. No data was changed.' >&2; exit 1; }

container_id="$(compose_container_id db)"
SPH_TEMP_ARCHIVE="/tmp/sph-restore-$$.dump"
docker cp "$archive_path" "$container_id:$SPH_TEMP_ARCHIVE"
sph_compose exec -T db sh -c 'pg_restore --list "$1" >/dev/null' sh "$SPH_TEMP_ARCHIVE"

echo 'Stopping application services before the destructive database restore...'
sph_compose stop gateway frontend api
destructive_restore_started=true
sph_compose exec -T db sh -c 'dropdb --force --if-exists --username="$POSTGRES_USER" "$1"' sh "$SPH_DATABASE_NAME"
sph_compose exec -T db sh -c 'createdb --username="$POSTGRES_USER" "$1"' sh "$SPH_DATABASE_NAME"
sph_compose exec -T db sh -c 'pg_restore --exit-on-error --no-owner --no-privileges --username="$POSTGRES_USER" --dbname="$1" "$2"' sh "$SPH_DATABASE_NAME" "$SPH_TEMP_ARCHIVE"

sph_compose build migration api frontend
sph_compose run --rm --no-deps migration
invalidate_sql='UPDATE sessions SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL; UPDATE password_reset_tokens SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL; UPDATE account_invitations SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL;'
sph_compose exec -T db psql --no-psqlrc --set ON_ERROR_STOP=1 --username "$SPH_DATABASE_USER" --dbname "$SPH_DATABASE_NAME" --command "$invalidate_sql"
sph_compose up -d --no-deps --force-recreate api frontend
wait_compose_service_healthy api
wait_compose_service_healthy frontend
sph_compose up -d --no-deps gateway
assert_running_version
echo 'Restore completed successfully. All restored sessions, password-reset tokens, and account invitations were invalidated.'

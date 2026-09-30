#!/usr/bin/env bash

set -Eeuo pipefail

SPH_REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
SPH_TEMP_ARCHIVE=""
SPH_VERIFY_DATABASE=""
SPH_INCOMPLETE_BACKUP=""
SPH_CREATED_BACKUP=""

sph_compose() {
	docker compose "$@"
}

sph_cleanup() {
	local exit_code=$?
	if [[ -n "${SPH_TEMP_ARCHIVE:-}" ]]; then
		sph_compose exec -T db sh -c 'rm -f "$1"' sh "$SPH_TEMP_ARCHIVE" >/dev/null 2>&1 || true
	fi
	if [[ -n "${SPH_VERIFY_DATABASE:-}" ]]; then
		sph_compose exec -T db sh -c 'dropdb --force --if-exists --username="$POSTGRES_USER" "$1"' sh "$SPH_VERIFY_DATABASE" >/dev/null 2>&1 || true
	fi
	if [[ -n "${SPH_INCOMPLETE_BACKUP:-}" && -d "$SPH_INCOMPLETE_BACKUP" ]]; then
		rm -f -- "$SPH_INCOMPLETE_BACKUP/database.dump" "$SPH_INCOMPLETE_BACKUP/manifest.json"
		rmdir -- "$SPH_INCOMPLETE_BACKUP" 2>/dev/null || true
	fi
	return "$exit_code"
}

trap sph_cleanup EXIT

assert_maintenance_prerequisites() {
	command -v git >/dev/null 2>&1 || { echo 'git is required.' >&2; return 1; }
	command -v docker >/dev/null 2>&1 || { echo 'docker is required.' >&2; return 1; }
	sph_compose version >/dev/null
	sph_compose config --quiet
	[[ -f "$SPH_REPOSITORY_ROOT/.env" ]] || { echo '.env is required in the repository root.' >&2; return 1; }
}

compose_container_id() {
	sph_compose ps -q "$1"
}

wait_compose_service_healthy() {
	local service=$1
	local timeout_seconds=${2:-120}
	local deadline=$((SECONDS + timeout_seconds))
	local container_id status
	while (( SECONDS < deadline )); do
		container_id="$(compose_container_id "$service")"
		if [[ -n "$container_id" ]]; then
			status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
			case "$status" in
				healthy|running) return 0 ;;
				unhealthy|exited|dead) echo "$service entered the $status state." >&2; return 1 ;;
			esac
		fi
		sleep 1
	done
	echo "Timed out waiting for $service to become healthy." >&2
	return 1
}

assert_database_ready() {
	if [[ -z "$(compose_container_id db)" ]]; then
		sph_compose up -d db
	fi
	wait_compose_service_healthy db
}

get_database_identity() {
	local output
	output="$(sph_compose exec -T db sh -c 'printf "%s\n%s\n" "$POSTGRES_DB" "$POSTGRES_USER"')"
	SPH_DATABASE_NAME="$(printf '%s\n' "$output" | sed -n '1p')"
	SPH_DATABASE_USER="$(printf '%s\n' "$output" | sed -n '2p')"
	if [[ ! "$SPH_DATABASE_NAME" =~ ^[A-Za-z_][A-Za-z0-9_]*$ || ! "$SPH_DATABASE_USER" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
		echo 'The configured PostgreSQL database or user name is not safe for maintenance automation.' >&2
		return 1
	fi
}

database_scalar() {
	local database=$1 user=$2 sql=$3
	sph_compose exec -T db psql --no-psqlrc --tuples-only --no-align --set ON_ERROR_STOP=1 --username "$user" --dbname "$database" --command "$sql" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

resolve_backup_root() {
	local requested=${1:-"$(dirname "$SPH_REPOSITORY_ROOT")/sph-backups"}
	mkdir -p -- "$requested"
	SPH_BACKUP_ROOT="$(cd "$requested" && pwd -P)"
	case "$SPH_BACKUP_ROOT/" in
		"$SPH_REPOSITORY_ROOT/"*) echo 'Backups must be stored outside the Git repository.' >&2; return 1 ;;
	esac
}

sha256_file() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | awk '{print $1}'
	else
		shasum -a 256 "$1" | awk '{print $1}'
	fi
}

json_escape() {
	printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

new_sph_full_backup() {
	local requested_root=${1:-}
	local version commit timestamp backup_id backup_directory archive_path manifest_path
	local container_id source_tables target_tables source_migrations target_migrations server_version archive_hash

	assert_database_ready
	get_database_identity
	resolve_backup_root "$requested_root"
	version="$(tr -d '\r\n' < "$SPH_REPOSITORY_ROOT/VERSION")"
	commit="$(git -C "$SPH_REPOSITORY_ROOT" rev-parse HEAD)"
	timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
	backup_id="sph-$version-$timestamp"
	backup_directory="$SPH_BACKUP_ROOT/$backup_id"
	archive_path="$backup_directory/database.dump"
	manifest_path="$backup_directory/manifest.json"
	SPH_TEMP_ARCHIVE="/tmp/$backup_id.dump"
	SPH_VERIFY_DATABASE="${SPH_DATABASE_NAME}_backup_verify"
	[[ "$SPH_VERIFY_DATABASE" =~ ^[A-Za-z_][A-Za-z0-9_]*_backup_verify$ ]] || { echo 'The verification database name is invalid.' >&2; return 1; }
	mkdir -- "$backup_directory"
	SPH_INCOMPLETE_BACKUP="$backup_directory"

	sph_compose exec -T db sh -c 'pg_dump --format=custom --compress=9 --file="$1" --username="$POSTGRES_USER" "$POSTGRES_DB"' sh "$SPH_TEMP_ARCHIVE"
	sph_compose exec -T db sh -c 'pg_restore --list "$1" >/dev/null' sh "$SPH_TEMP_ARCHIVE"
	container_id="$(compose_container_id db)"
	docker cp "$container_id:$SPH_TEMP_ARCHIVE" "$archive_path"
	[[ -s "$archive_path" ]] || { echo 'The backup archive was not created.' >&2; return 1; }

	sph_compose exec -T db sh -c 'dropdb --force --if-exists --username="$POSTGRES_USER" "$1"' sh "$SPH_VERIFY_DATABASE"
	sph_compose exec -T db sh -c 'createdb --username="$POSTGRES_USER" "$1"' sh "$SPH_VERIFY_DATABASE"
	sph_compose exec -T db sh -c 'pg_restore --exit-on-error --no-owner --no-privileges --username="$POSTGRES_USER" --dbname="$1" "$2"' sh "$SPH_VERIFY_DATABASE" "$SPH_TEMP_ARCHIVE"
	source_tables="$(database_scalar "$SPH_DATABASE_NAME" "$SPH_DATABASE_USER" "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")"
	target_tables="$(database_scalar "$SPH_VERIFY_DATABASE" "$SPH_DATABASE_USER" "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")"
	source_migrations="$(database_scalar "$SPH_DATABASE_NAME" "$SPH_DATABASE_USER" 'SELECT COUNT(*) FROM "_prisma_migrations";')"
	target_migrations="$(database_scalar "$SPH_VERIFY_DATABASE" "$SPH_DATABASE_USER" 'SELECT COUNT(*) FROM "_prisma_migrations";')"
	[[ "$source_tables" == "$target_tables" && "$source_migrations" == "$target_migrations" ]] || { echo 'The restored verification database does not match the source database structure.' >&2; return 1; }

	server_version="$(database_scalar "$SPH_DATABASE_NAME" "$SPH_DATABASE_USER" 'SHOW server_version;')"
	archive_hash="$(sha256_file "$archive_path")"
	printf '{\n  "formatVersion": 1,\n  "application": "SME Portal Hub",\n  "backupId": "%s",\n  "createdAtUtc": "%s",\n  "productVersion": "%s",\n  "sourceCommit": "%s",\n  "databaseName": "%s",\n  "postgresVersion": "%s",\n  "archiveFile": "database.dump",\n  "archiveFormat": "postgresql-custom",\n  "sha256": "%s",\n  "verifiedRestore": true\n}\n' \
		"$(json_escape "$backup_id")" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$(json_escape "$version")" "$(json_escape "$commit")" \
		"$(json_escape "$SPH_DATABASE_NAME")" "$(json_escape "$server_version")" "$archive_hash" > "$manifest_path"

	SPH_CREATED_BACKUP="$backup_directory"
	SPH_INCOMPLETE_BACKUP=""
	sph_compose exec -T db sh -c 'rm -f "$1"' sh "$SPH_TEMP_ARCHIVE"
	SPH_TEMP_ARCHIVE=""
	sph_compose exec -T db sh -c 'dropdb --force --if-exists --username="$POSTGRES_USER" "$1"' sh "$SPH_VERIFY_DATABASE"
	SPH_VERIFY_DATABASE=""
}

wait_migration_succeeded() {
	local timeout_seconds=${1:-180}
	local deadline=$((SECONDS + timeout_seconds))
	local container_id state
	while (( SECONDS < deadline )); do
		container_id="$(compose_container_id migration)"
		if [[ -n "$container_id" ]]; then
			state="$(docker inspect --format '{{.State.Status}} {{.State.ExitCode}}' "$container_id")"
			[[ "$state" == 'exited 0' ]] && return 0
			if [[ "$state" == exited\ * ]]; then echo "Migration failed ($state)." >&2; return 1; fi
		fi
		sleep 1
	done
	echo 'Timed out waiting for the migration job.' >&2
	return 1
}

assert_running_version() {
	local timeout_seconds=${1:-180}
	local expected_version response
	local deadline=$((SECONDS + timeout_seconds))
	expected_version="$(tr -d '\r\n' < "$SPH_REPOSITORY_ROOT/VERSION")"
	while (( SECONDS < deadline )); do
		response="$(sph_compose exec -T gateway wget -qO- http://127.0.0.1/v1/health 2>/dev/null || true)"
		if [[ "$response" == *'"status":"success"'* && "$response" == *'"healthy":true'* && "$response" == *"\"version\":\"$expected_version\""* ]]; then
			return 0
		fi
		sleep 2
	done
	echo "The running system did not report version $expected_version as healthy." >&2
	return 1
}

manifest_string() {
	local manifest=$1 field=$2
	sed -n "s/^[[:space:]]*\"$field\":[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$manifest" | head -n 1
}

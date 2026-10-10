#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=maintenance-common.sh
source "$SCRIPT_DIRECTORY/maintenance-common.sh"

services_stopped=false
source_updated=false
previous_commit=""

update_failure() {
	local exit_code=$?
	trap - ERR
	echo "Update failed with exit code $exit_code." >&2
	if [[ "$services_stopped" == true && "$source_updated" == false ]]; then
		if sph_compose start api frontend gateway; then
			echo 'The previous application containers were restarted because the source revision was not changed.' >&2
		else
			echo 'The previous application containers could not be restarted automatically.' >&2
		fi
	fi
	if [[ -n "${SPH_CREATED_BACKUP:-}" ]]; then
		printf 'The verified backup remains at: %s\n' "$SPH_CREATED_BACKUP" >&2
		echo 'Do not restore it automatically. Diagnose the failure first, then use restore.sh only when recovery is required.' >&2
	fi
	exit "$exit_code"
}

trap update_failure ERR
cd "$SPH_REPOSITORY_ROOT"
assert_maintenance_prerequisites
[[ -z "$(git status --porcelain)" ]] || { echo 'The Git working tree must be clean before updating.' >&2; exit 1; }
git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null
previous_commit="$(git rev-parse HEAD)"
assert_database_ready

echo 'Stopping application services to prevent writes during the update backup...'
sph_compose stop gateway frontend api
services_stopped=true
new_sph_full_backup "${1:-}"
printf 'Verified update backup: %s\n' "$SPH_CREATED_BACKUP"

git pull --ff-only
current_commit="$(git rev-parse HEAD)"
[[ "$current_commit" != "$previous_commit" ]] && source_updated=true
docker run --rm --user "$(id -u):$(id -g)" --mount "type=bind,source=$PWD,target=/workspace" --workdir /workspace node:22-alpine node scripts/install-maintenance.mjs gateway-config
sph_compose rm --force --stop migration
sph_compose build
sph_compose run --rm --no-deps --volume "$SPH_CREATED_BACKUP:/baseline-backup" migration node scripts/baseline-existing.mjs /baseline-backup/manifest.json --if-legacy
sph_compose up -d --no-build
wait_migration_succeeded
wait_compose_service_healthy api
wait_compose_service_healthy frontend
assert_running_version
printf 'Update completed successfully. Backup retained at: %s\n' "$SPH_CREATED_BACKUP"

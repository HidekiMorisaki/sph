#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=maintenance-common.sh
source "$SCRIPT_DIRECTORY/maintenance-common.sh"

cd "$SPH_REPOSITORY_ROOT"
assert_maintenance_prerequisites
new_sph_full_backup "${1:-}"
printf 'Verified full backup created: %s\n' "$SPH_CREATED_BACKUP"
printf '%s\n' 'Keep this directory private. It contains authentication and application data.'

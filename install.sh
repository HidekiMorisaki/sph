#!/usr/bin/env bash
set -Eeuo pipefail
# Generated resources use Bash builtins, including on macOS Bash 3.2.
cd -- "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
if ! source scripts/locales/generated/languages.sh; then printf '%s\n' 'Installer language files are missing or invalid. Extract the complete release again before running the installer.' >&2; exit 1; fi
language=''
while true; do
	printf '%s\n' "$installer_language_menu"
	read -r -p "$installer_language_prompt" language
	language=${language:-1}
	if [[ "$language" =~ ^[1-9][0-9]{0,3}$ ]] && ((language <= ${#installer_locales[@]})); then break; fi
done
locale=${installer_locales[language - 1]}
if ! source "scripts/locales/generated/$locale.sh"; then printf '%s\n' 'Installer language files are missing or invalid. Extract the complete release again before running the installer.' >&2; exit 1; fi
message() {
	local key=$1 template result='' prefix position
	shift
	template=$(installer_template "$key" && printf '.') || return 1
	template=${template%.}
	# Consume only the template, so braces in replacement values remain literal.
	while [[ "$template" =~ \{([1-9][0-9]*)\} ]]; do
		position=${BASH_REMATCH[1]}
		((position <= $#)) || return 1
		prefix=${template%%"{${position}}"*}
		result+="$prefix${!position}"
		template=${template#*"{${position}}"}
	done
	printf '%s' "$result$template"
}
color='' reset=''
if [[ -t 1 && "${TERM:-dumb}" != dumb && -z "${NO_COLOR+x}" ]]; then color=1; reset=$'\033[0m'; fi
line() {
	local tone=$1; shift
	[[ -z "$color" ]] || printf '\033[%sm' "$tone"
	message "$@"; printf '%s\n' "$reset"
}
started=$SECONDS
step=0 stage='' active=''
failure_key='error.unexpected'
holiday_jp=false holiday_us=false
begin_step() {
	failure_key='error.unexpected'
	step=$((step + 1)); stage=$(message "$1")
	local bar='' index
	for ((index=1; index<=7; index++)); do
		if ((index<step)); then bar+='='; elif ((index==step)); then bar+='>'; else bar+='.'; fi
	done
	printf '\n'; line 96 'progress.stage' "$step" "$bar" "$stage"
}
complete_step() { local total=$((SECONDS - started)); line 32 'progress.complete' "$stage" "$(message 'progress.duration' "$((total / 60))" "$((total % 60))")"; }
failure() {
	[[ -z "$active" ]] || kill "$active" 2>/dev/null || true
	printf '\n' >&2
	line 31 'error.stoppedShell' >&2
	line 31 'progress.stopped' "$step" "$stage" >&2
	# Never display arbitrary command output; it can contain credentials.
	line 31 "$failure_key" >&2
	exit 1
}
trap failure ERR
trap "failure_key='error.interrupted'; failure" INT TERM
progress() {
	local phase_start=$SECONDS frame=0 elapsed total
	local frames=('|' '/' '-' '\')
	"$@" >/dev/null 2>&1 & active=$!
	while kill -0 "$active" 2>/dev/null; do
		elapsed=$((SECONDS - phase_start)); total=$((SECONDS - started))
		if [[ -t 1 ]]; then
			printf '\r%s  %s %s | %02d:%02d | ' "${color:+$'\033[94m'}" "${frames[frame % 4]}" "$stage" "$((elapsed / 60))" "$((elapsed % 60))"
			message 'progress.total'; printf ' %02d:%02d%s        ' "$((total / 60))" "$((total % 60))" "$reset"
		fi
		frame=$((frame + 1)); sleep 1
	done
	if wait "$active"; then active=''; else active=''; return 1; fi
	[[ ! -t 1 ]] || printf '\n'
}
line 36 'frame.separator'
line 36 'title.banner'
line 36 'frame.separator'
line 37 'progress.notice'
begin_step 'stage.environment'
[[ -t 0 && -t 1 ]] || { failure_key='error.terminal'; failure; }
[[ ! -e .env ]] || { failure_key='error.existingConfiguration'; failure; }
command -v docker >/dev/null 2>&1 || { failure_key='error.dockerRequired'; failure; }
failure_key='error.dockerConnection'
docker info >/dev/null 2>&1
failure_key='error.compose'
docker compose version >/dev/null 2>&1
failure_key='error.docker'
volumes=$(docker volume ls --format '{{.Name}}' 2>/dev/null)
containers=$(docker ps -a --format '{{.Names}}' 2>/dev/null)
if printf '%s\n' "$volumes" | grep -qx 'sph-db-data' || printf '%s\n' "$containers" | grep -Eq '^sph-(db|api|frontend|gateway|migration)$'; then
	failure_key='error.existingResources'; failure
fi
unset APP_ORIGIN HTTP_PORT POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD POSTGRES_HOST POSTGRES_PORT CORS_ALLOWED_ORIGINS IT_ASSET_CREDENTIAL_ENCRYPTION_KEY
for key in ${!INITIAL_ADMIN_@}; do unset "$key"; done
compose=(docker compose -f docker-compose.yml --env-file .env -p sph)
maintenance=(docker run --rm --add-host host.docker.internal:host-gateway --user "$(id -u):$(id -g)" --mount "type=bind,source=$PWD,target=/workspace" --workdir /workspace node:22-alpine node scripts/install-maintenance.mjs)
complete_step
begin_step 'stage.setup'
failure_key='error.pull'
progress docker pull node:22-alpine
failure_key='error.setup'
docker run --rm -it --network none -e NO_COLOR -e TERM --user "$(id -u):$(id -g)" --mount "type=bind,source=$PWD,target=/workspace" --workdir /workspace node:22-alpine node scripts/install-config.mjs "$locale" 2>/dev/null
failure_key='error.permissions'
chmod 600 .env 2>/dev/null
failure_key='error.settings'
connection=$("${maintenance[@]}" settings-shell 2>/dev/null)
port=${connection%%$'\n'*}; origin=${connection#*$'\n'}
complete_step
begin_step 'stage.build'
failure_key='error.build'
progress "${compose[@]}" build
complete_step
begin_step 'stage.start'
failure_key='error.start'
progress "${compose[@]}" up -d --no-build --wait --wait-timeout 300
failure_key='error.migration'
[[ "$(docker inspect --format '{{.State.Status}} {{.State.ExitCode}}' sph-migration 2>/dev/null)" == 'exited 0' ]]
migration_log=$(docker logs sph-migration 2>/dev/null)
if printf '%s\n' "$migration_log" | grep -qx 'SPH_SAMPLE_HOLIDAY_WARNING=JP'; then holiday_jp=true; fi
if printf '%s\n' "$migration_log" | grep -qx 'SPH_SAMPLE_HOLIDAY_WARNING=US'; then holiday_us=true; fi
unset migration_log
complete_step
begin_step 'stage.check'
failure_key='error.health'
progress "${maintenance[@]}" check
complete_step
begin_step 'stage.cleanup'
failure_key='error.cleanup'
"${maintenance[@]}" prepare-cleanup >/dev/null 2>&1
failure_key='error.permissions'
chmod 600 .env.install-clean 2>/dev/null
failure_key='error.cleanup'
mv -f -- .env.install-clean .env 2>/dev/null
failure_key='error.removeMigration'
"${compose[@]}" rm -f migration >/dev/null 2>&1
failure_key='error.refreshDb'
progress "${compose[@]}" up -d --no-build --no-deps --force-recreate --wait --wait-timeout 300 db
failure_key='error.refreshApi'
progress "${compose[@]}" up -d --no-build --no-deps --force-recreate --wait --wait-timeout 300 api
complete_step
begin_step 'stage.final'
failure_key='error.inspectCredentials'
environment=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' sph-db sph-api 2>/dev/null)
if printf '%s\n' "$environment" | grep -q '^INITIAL_ADMIN_'; then failure_key='error.initialCredentials'; failure; fi
unset environment
failure_key='error.health'
progress "${maintenance[@]}" check
if ! progress "${maintenance[@]}" public-check; then
	line 33 'warning.publicUrl'
fi
complete_step
printf '\n'
line 32 'complete' "$origin"
if [[ "$holiday_jp" == true ]]; then line 33 'warning.holidayJP'; fi
if [[ "$holiday_us" == true ]]; then line 33 'warning.holidayUS'; fi
line 37 'complete.notice'

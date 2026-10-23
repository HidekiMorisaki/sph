#!/usr/bin/env bash
set -Eeuo pipefail
# Generated resources use Bash builtins, including on macOS Bash 3.2.
cd -- "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
if ! source scripts/locales/generated/languages.sh; then printf '%s\n' 'Installer language files are missing or invalid. Extract the complete release again before running the installer.' >&2; exit 1; fi
light_color=''
[[ "${COLORFGBG:-}" =~ (^|\;)(7|15)$ ]] && light_color=1
menu_color=''
if [[ -t 1 && "${TERM:-dumb}" != dumb && -z "${NO_COLOR+x}" ]]; then menu_color=1; fi
option_color=94; question_color=96; default_color=95
if [[ -n "$light_color" ]]; then option_color=34; question_color=36; default_color=35; fi
language=''
while true; do
	if [[ -n "$menu_color" ]]; then
		printf '\033[%sm%s\033[0m\n' "$option_color" "$installer_language_menu"
		printf '\033[%sm%s \033[%sm[1]\033[0m: ' "$question_color" "$installer_language_label" "$default_color"
		read -r language
	else
		printf '%s\n' "$installer_language_menu"
		read -r -p "$installer_language_prompt" language
	fi
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
	clear_progress
	if [[ -n "$light_color" ]] && ((tone >= 90 && tone <= 97)); then tone=$((tone - 60)); fi
	[[ -z "$color" ]] || printf '\033[%sm' "$tone"
	message "$@"; printf '%s\n' "$reset"
}
step=0 stage='' active=''
probe_dir='' probe_container='' failure_value=''
command_timeout=1800
preflight_failures=0
failure_key='error.unexpected'
holiday_jp=false holiday_us=false
if ! source scripts/install-progress.sh 2>/dev/null; then message 'error.releaseFiles'; printf '\n'; exit 1; fi
confirm_capacity() {
	local label=$1 current=$2 recommended=$3 warning=$4 unknown=$5 answer
	if [[ -n "$current" ]] && LC_ALL=C awk -v current="$current" -v recommended="$recommended" 'BEGIN { exit !(current >= recommended) }'; then
		line 32 'preflight.pass' "$(message "$label")"
		advance_step
		return
	fi
	line 33 'preflight.warning' "$(message "$label")"
	if [[ -n "$current" ]]; then line 33 "$warning" "$recommended" "$current"; else line 33 "$unknown" "$recommended"; fi
	line 96 'confirm.continue'
	line 94 'prompt.option' 1 "$(message 'confirm.yes')"
	line 94 'prompt.option' 2 "$(message 'confirm.no')"
	while true; do
		if [[ -n "$color" ]]; then
			printf '\033[%sm%s \033[%sm[2]%s: ' "$question_color" "$(message 'input.selectNumber')" "$default_color" "$reset"
		else message 'prompt.styledDefault' "$(message 'input.selectNumber')" '[2]'; fi
		if ! IFS= read -r answer; then failure_key='error.cancelled'; failure; fi
		answer=${answer//[[:space:]]/}
		if [[ "$answer" == 1 ]]; then advance_step; return; fi
		if [[ -z "$answer" || "$answer" == 2 ]]; then failure_key='error.cancelled'; failure; fi
		line 33 'input.invalid'
	done
}
failure() {
	[[ -z "$active" ]] || kill "$active" 2>/dev/null || true
	render_progress "$(message 'progress.stoppedState')" true
	printf '\n' >&2
	line 31 'error.stoppedShell' >&2
	# Never display arbitrary command output; it can contain credentials.
	line 31 "$failure_key" "$failure_value" >&2
	exit 1
}
cleanup_preflight() {
	if [[ -n "$active" ]]; then kill "$active" 2>/dev/null || true; wait "$active" 2>/dev/null || true; fi
	if [[ -n "$probe_container" && -n "$probe_dir" ]]; then bounded_docker rm -f "$probe_container" >/dev/null 2>&1 || true; fi
	if [[ -n "$probe_dir" && -d "$probe_dir" ]]; then
		rm -f -- "$probe_dir/first" "$probe_dir/second" "$probe_dir/token" "$probe_dir/docker.out" "$probe_dir/docker.err" 2>/dev/null || true
		[[ ! -d "$probe_dir/host-test" ]] || rmdir -- "$probe_dir/host-test" 2>/dev/null || true
		rmdir -- "$probe_dir" 2>/dev/null || line 33 'error.writeFolder'
	fi
}
trap cleanup_preflight EXIT
trap 'failure_status=$?; if ((failure_status == 124)); then failure_key="error.timeout"; fi; failure' ERR
trap "failure_key='error.interrupted'; failure" INT TERM
progress() {
	local phase_start=$SECONDS frame=0
	"$@" >/dev/null 2>&1 & active=$!
	while kill -0 "$active" 2>/dev/null; do
		if ((SECONDS - phase_start >= command_timeout)); then kill "$active" 2>/dev/null || true; wait "$active" 2>/dev/null || true; active=''; failure_key='error.timeout'; return 1; fi
		render_progress '' false "$frame"
		frame=$((frame + 1)); sleep 1
	done
	if wait "$active"; then active=''; else active=''; return 1; fi
	advance_step
}
line 36 'frame.separator'
line 36 'title.banner'
line 36 'frame.separator'
line 0 'progress.notice'
begin_step 'stage.environment' 14
[[ -t 0 && -t 1 ]] || { failure_key='error.terminal'; failure; }
check_result() {
	local label=$1 reason=$2 available=$3 code
	shift 3
	if [[ "$available" != true ]]; then line 33 'preflight.skip' "$(message "$label")"; advance_step; return 0; fi
	if "$@" >/dev/null 2>&1; then line 32 'preflight.pass' "$(message "$label")"; else
		code=$?
		preflight_failures=$((preflight_failures + 1))
		line 31 'preflight.fail' "$(message "$label")"
		if ((code == 124)); then line 31 'error.timeout'; else line 31 "$reason"; fi
	fi
	advance_step
}
bounded_docker() {
	local started_check=$SECONDS code=0
	docker "$@" > "$probe_dir/docker.out" 2> "$probe_dir/docker.err" & active=$!
	while kill -0 "$active" 2>/dev/null; do
		if ((SECONDS - started_check >= 60)); then kill "$active" 2>/dev/null || true; wait "$active" 2>/dev/null || true; active=''; return 124; fi
		sleep 0.1
	done
	wait "$active" || code=$?
	active=''
	((code == 0)) || return "$code"
	cat -- "$probe_dir/docker.out"
}
check_files() {
	local file
	[[ -r scripts/install-required-files.txt ]] || return 1
	while IFS= read -r file || [[ -n "$file" ]]; do
		file=${file%$'\r'}
		[[ -f "$file" && -r "$file" ]] || return 1
	done < scripts/install-required-files.txt
}
check_write() {
	local token
	probe_dir=$(mktemp -d "$PWD/.sph-preflight-XXXXXXXX") || return 1
	chmod 700 "$probe_dir" || return 1
	mkdir "$probe_dir/host-test" && rmdir "$probe_dir/host-test" || return 1
	token=$(printf '%08x%08x' "$RANDOM" "$RANDOM")
	printf '%s' "$token" > "$probe_dir/first" && chmod 600 "$probe_dir/first" &&
		mv -- "$probe_dir/first" "$probe_dir/second" && [[ $(cat "$probe_dir/second") == "$token" ]] &&
		rm -- "$probe_dir/second" && printf '%s' "$token" > "$probe_dir/token"
}
check_compose() {
	local version
	version=$(bounded_docker compose version --short) || return $?
	[[ "$version" =~ ^v?([2-9]|[1-9][0-9]+)\. ]]
}
check_linux() { local os; os=$(bounded_docker info --format '{{.OSType}}') || return $?; [[ "$os" == linux ]]; }
check_resources() {
	local volumes containers
	volumes=$(bounded_docker volume ls --format '{{.Name}}') || return $?
	containers=$(bounded_docker ps -a --format '{{.Names}}') || return $?
	if printf '%s\n' "$volumes" | grep -Eq '^sph-(db-data|gateway-data|gateway-config)$' || printf '%s\n' "$containers" | grep -Eq '^sph-(db|api|frontend|gateway|migration)$'; then
		return 2
	fi
}
check_commands() { local required; for required in mkdir mktemp chmod mv rm rmdir cat grep sleep id uname awk; do command -v "$required" >/dev/null 2>&1 || return 1; done; }
check_result 'check.commands' 'error.commands' true check_commands
check_result 'check.fresh' 'error.existingConfiguration' true test ! -e .env
check_result 'check.files' 'error.releaseFiles' true check_files
before=$preflight_failures
check_result 'check.write' 'error.writeFolder' true check_write
writable=false; ((before != preflight_failures)) || writable=true
before=$preflight_failures
check_result 'check.docker' 'error.dockerRequired' true command -v docker
has_docker=false; ((before != preflight_failures)) || has_docker=true
before=$preflight_failures
available=false; [[ "$has_docker" == true && "$writable" == true ]] && available=true
check_result 'check.connection' 'error.dockerConnection' "$available" bounded_docker info
connected=false; [[ "$available" == true && "$before" == "$preflight_failures" ]] && connected=true
check_result 'check.compose' 'error.compose' "$available" check_compose
check_result 'check.build' 'error.buildSupport' "$available" bounded_docker buildx version
check_result 'check.linux' 'error.linuxContainers' "$connected" check_linux
if [[ "$connected" == true && ! -e .env ]]; then
	if check_resources; then line 32 'preflight.pass' "$(message 'check.resources')"; else
		code=$?; preflight_failures=$((preflight_failures + 1)); line 31 'preflight.fail' "$(message 'check.resources')"
		if ((code == 2)); then line 31 'error.existingResources'; elif ((code == 124)); then line 31 'error.timeout'; else line 31 'error.docker'; fi
	fi
else line 33 'preflight.skip' "$(message 'check.resources')"; fi
advance_step
if ((preflight_failures > 0)); then failure_key='error.preflight'; failure; fi
failure_key='error.pull'
command_timeout=300
progress docker pull node:22-alpine
command_timeout=1800
failure_key='error.workspace'
probe_container="sph-preflight-$(printf '%08x%08x' "$RANDOM" "$RANDOM")"
workspace=$(bounded_docker run --rm --name "$probe_container" --network none --user "$(id -u):$(id -g)" --mount "type=bind,source=$PWD,target=/workspace" --workdir /workspace node:22-alpine node scripts/install-preflight.mjs "${probe_dir##*/}" "$(cat "$probe_dir/token")")
line 32 'preflight.pass' "$(message 'check.workspace')"
advance_step
# Read only numeric results; never echo arbitrary container diagnostics.
free_gib=''
if [[ "$workspace" =~ ^\{\"freeGiB\":([0-9]+)\}$ ]]; then free_gib=${BASH_REMATCH[1]}; fi
confirm_capacity 'check.disk' "$free_gib" 10 'warning.disk' 'warning.diskUnknown'
memory_bytes=$(bounded_docker info --format '{{.MemTotal}}') || memory_bytes=''
memory_gib=''
if [[ "$memory_bytes" =~ ^[0-9]+$ && "$memory_bytes" != 0 ]]; then
	memory_gib="$((memory_bytes / 1073741824)).$((memory_bytes % 1073741824 * 10 / 1073741824))"
	memory_gib=${memory_gib%.0}
fi
confirm_capacity 'check.memory' "$memory_gib" 4 'warning.memory' 'warning.memoryUnknown'
unset APP_ORIGIN HTTP_PORT GATEWAY_TLS_MODE GATEWAY_HTTP_PUBLISH GATEWAY_HTTPS_PUBLISH ACME_EMAIL POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD POSTGRES_HOST POSTGRES_PORT CORS_ALLOWED_ORIGINS IT_ASSET_CREDENTIAL_ENCRYPTION_KEY
for key in ${!INITIAL_ADMIN_@}; do unset "$key"; done
compose=(docker compose -f docker-compose.local.yml --env-file .env -p sph)
maintenance=(docker run --rm --add-host host.docker.internal:host-gateway --user "$(id -u):$(id -g)" --mount "type=bind,source=$PWD,target=/workspace" --workdir /workspace node:22-alpine node scripts/install-maintenance.mjs)
complete_step
begin_step 'stage.setup' 6
failure_key='error.setup'
host_name=$(hostname 2>/dev/null || true)
host_ipv4=''
if [[ $(uname -s) == Darwin ]]; then
	host_ipv4=$(/sbin/ifconfig -a 2>/dev/null | awk '/^[^[:space:]]/ { active = /<[^>]*UP[^>]*>/ } active && /^[[:space:]]*inet[[:space:]]/ { print $2 }' || true)
elif command -v ip >/dev/null 2>&1; then
	host_ipv4=$(ip -o -4 addr show up 2>/dev/null | awk '{ sub(/\/.*/, "", $4); print $4 }' || true)
elif command -v hostname >/dev/null 2>&1; then
	host_ipv4=$(hostname -I 2>/dev/null || true)
fi
host_ipv4=${host_ipv4//$'\n'/,}
clear_progress
docker run --rm -it --network none -e NO_COLOR -e COLORFGBG -e "TERM=${TERM:-dumb}" -e "SPH_INSTALL_HOST_IPV4=$host_ipv4" -e "SPH_INSTALL_HOSTNAME=$host_name" --user "$(id -u):$(id -g)" --mount "type=bind,source=$PWD,target=/workspace" --workdir /workspace node:22-alpine node scripts/install-config.mjs "$locale" 2>/dev/null
failure_key='error.permissions'
chmod 600 .env 2>/dev/null
advance_step
failure_key='error.settings'
connection=$(bounded_docker "${maintenance[@]:1}" settings-shell)
port=${connection%%$'\n'*}; remainder=${connection#*$'\n'}; origin=${remainder%%$'\n'*}; connection_mode=${remainder#*$'\n'}
advance_step
failure_key='error.composeConfig'
bounded_docker "${compose[@]:1}" config --quiet >/dev/null
line 32 'preflight.pass' "$(message 'check.settings')"
advance_step
failure_key='error.ports'
bindings=('127.0.0.1:5432:5432')
if [[ "$connection_mode" == local ]]; then bindings+=("127.0.0.1:$port:80" '127.0.0.1::443')
elif [[ "$connection_mode" == internal-http ]]; then host=${origin#http://}; host=${host%%:*}; bindings+=("$host:$port:80" '127.0.0.1::443')
else bindings+=('80:80' '443:443'); fi
failure_value="${bindings[*]}"
probe_arguments=(run --detach --rm --name "$probe_container")
for binding in "${bindings[@]}"; do probe_arguments+=(--publish "$binding"); done
bounded_docker "${probe_arguments[@]}" node:22-alpine node -e 'setTimeout(()=>{},60000)' >/dev/null
bounded_docker rm -f "$probe_container" >/dev/null
line 32 'preflight.pass' "$(message 'check.ports')"
advance_step
failure_value=''
failure_key='error.networkPreflight'
command_timeout=60
progress "${maintenance[@]}" preflight
command_timeout=1800
line 32 'preflight.pass' "$(message 'check.network')"
failure_key='error.gatewayConfig'
bounded_docker "${maintenance[@]:1}" gateway-config >/dev/null
advance_step
complete_step
begin_step 'stage.build' 1
failure_key='error.build'
progress "${compose[@]}" build
complete_step
begin_step 'stage.start' 3
failure_key='error.start'
progress "${compose[@]}" up -d --no-build --wait --wait-timeout 300
failure_key='error.migration'
[[ "$(bounded_docker inspect --format '{{.State.Status}} {{.State.ExitCode}}' sph-migration 2>/dev/null)" == 'exited 0' ]]
advance_step
migration_log=$(bounded_docker logs sph-migration 2>/dev/null)
if printf '%s\n' "$migration_log" | grep -qx 'SPH_SAMPLE_HOLIDAY_WARNING=JP'; then holiday_jp=true; fi
if printf '%s\n' "$migration_log" | grep -qx 'SPH_SAMPLE_HOLIDAY_WARNING=US'; then holiday_us=true; fi
book_lookup=false
book_cover=false
if printf '%s\n' "$migration_log" | grep -qx 'SPH_SAMPLE_BOOK_WARNING=lookup'; then book_lookup=true; fi
if printf '%s\n' "$migration_log" | grep -qx 'SPH_SAMPLE_BOOK_WARNING=cover'; then book_cover=true; fi
unset migration_log
advance_step
complete_step
begin_step 'stage.check' 2
if [[ "$connection_mode" == internal ]]; then
	failure_key='error.caExport'
	mkdir -p .runtime/ca
	chmod 700 .runtime/ca
	for ((attempt=0; attempt<30; attempt++)); do
		if bounded_docker cp sph-gateway:/data/caddy/pki/authorities/local/root.crt .runtime/ca/root.crt >/dev/null 2>&1; then break; fi
		sleep 1
	done
	[[ -s .runtime/ca/root.crt ]]
	chmod 644 .runtime/ca/root.crt
fi
advance_step
failure_key='error.health'
progress "${maintenance[@]}" check
complete_step
begin_step 'stage.cleanup' 6
failure_key='error.cleanup'
bounded_docker "${maintenance[@]:1}" prepare-cleanup >/dev/null
advance_step
failure_key='error.permissions'
chmod 600 .env.install-clean 2>/dev/null
advance_step
failure_key='error.cleanup'
mv -f -- .env.install-clean .env 2>/dev/null
advance_step
failure_key='error.removeMigration'
bounded_docker "${compose[@]:1}" rm -f migration >/dev/null
advance_step
failure_key='error.refreshDb'
progress "${compose[@]}" up -d --no-build --no-deps --force-recreate --wait --wait-timeout 300 db
failure_key='error.refreshApi'
progress "${compose[@]}" up -d --no-build --no-deps --force-recreate --wait --wait-timeout 300 api
complete_step
begin_step 'stage.final' 3
failure_key='error.inspectCredentials'
environment=$(bounded_docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' sph-db sph-api 2>/dev/null)
if printf '%s\n' "$environment" | grep -q '^INITIAL_ADMIN_'; then failure_key='error.initialCredentials'; failure; fi
unset environment
advance_step
failure_key='error.health'
progress "${maintenance[@]}" check
if ! progress "${maintenance[@]}" public-check; then
	line 33 'warning.publicUrl'
	advance_step
fi
complete_step
printf '\n'
line 32 'complete' "$origin"
if [[ "$holiday_jp" == true ]]; then line 33 'warning.holidayJP'; fi
if [[ "$holiday_us" == true ]]; then line 33 'warning.holidayUS'; fi
if [[ "$book_lookup" == true ]]; then line 33 'warning.book.lookup'; fi
if [[ "$book_cover" == true ]]; then line 33 'warning.book.cover'; fi
line 0 'complete.notice'

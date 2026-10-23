# Bash 3.2 compatible. Progress measures completed work, never elapsed time.
progress_visible=false progress_row_width=0 stage_units=0 stage_total=1 stage_percent=0
text_width() { local value=$1 wide; wide=${value//[ -~]/}; printf '%s' "$((${#value} + ${#wide}))"; }
initialize_progress_columns() {
	local phase measured
	progress_label_width=0; progress_state_width=0
	progress_running_state=$(message 'progress.running')
	progress_done_state=$(message 'progress.done')
	progress_stopped_state=$(message 'progress.stoppedState')
	for phase in environment setup build start check cleanup final; do
		measured=$(text_width "$(message "stage.$phase")"); ((measured <= progress_label_width)) || progress_label_width=$measured
	done
	for phase in "$progress_running_state |" "$progress_done_state" "$progress_stopped_state"; do
		measured=$(text_width "$phase"); ((measured <= progress_state_width)) || progress_state_width=$measured
	done
	return 0
}
clear_progress() {
	if [[ "$progress_visible" == true ]]; then printf '\r%*s\r' "$progress_row_width" ''; progress_visible=false; fi
}
render_progress() {
	local state=${1:-} permanent=${2:-false} frame=${3:-0} overall columns label template fixed width filled overall_filled bar='' overall_bar='' index row tone stage_number overall_number label_width=$progress_label_width available padding stopped=false
	((step > 0)) || return 0
	[[ -t 1 || "$permanent" == true ]] || return 0
	clear_progress
	local frames=('|' '/' '-' '\')
	[[ -n "$state" ]] || state="$progress_running_state ${frames[frame % 4]}"
	[[ "$state" != "$progress_stopped_state" ]] || stopped=true
	overall=$((((step - 1) * 100 + stage_percent) / 7))
	columns=${COLUMNS:-120}
	if [[ -t 1 ]] && command -v stty >/dev/null 2>&1; then
		local size; size=$(stty size 2>/dev/null </dev/tty) || size=''
		[[ ! "$size" =~ ^[0-9]+[[:space:]]+([0-9]+)$ ]] || columns=${BASH_REMATCH[1]}
	fi
	[[ "$columns" =~ ^[1-9][0-9]{1,3}$ ]] || columns=120
	template='progress.line'; ((columns >= 64)) || template='progress.compact'
	stage_number=$(printf '%3d' "$stage_percent"); overall_number=$(printf '%3d' "$overall")
	# Use one shared display-width column for all seven phase labels and states.
	padding=$((progress_state_width - $(text_width "$state"))); ((padding >= 0)) || padding=0
	state+=$(printf '%*s' "$padding" '')
	fixed=$(text_width "$(message "$template" "$step" '' '' "$stage_number" '' "$overall_number" "$state")")
	available=$((columns - fixed - 1 - 8)); ((available >= 0)) || available=0
	((label_width <= available)) || label_width=$available
	label=$stage
	while (($(text_width "$label") > label_width)); do
		label=${label:0:${#label}-1}
	done
	label+=$(printf '%*s' "$((label_width - $(text_width "$label")))" '')
	fixed=$((fixed + label_width))
	width=$(((columns - fixed - 1) / 2)); ((width >= 1)) || width=1; ((width <= 60)) || width=60
	filled=$((width * stage_percent / 100)); overall_filled=$((width * overall / 100))
	for ((index=0; index<width; index++)); do
		if ((index < filled)); then bar+='='; else bar+='-'; fi
		if ((index < overall_filled)); then overall_bar+='='; else overall_bar+='-'; fi
	done
	row=$(message "$template" "$step" "$label" "$bar" "$stage_number" "$overall_bar" "$overall_number" "$state")
	tone=$option_color; ((stage_percent < 100)) || tone=32
	[[ "$stopped" != true ]] || tone=31
	[[ -z "$color" ]] || printf '\033[%sm' "$tone"
	printf '%s%s' "$row" "$reset"
	if [[ "$permanent" == true ]]; then printf '\n'; else progress_visible=true; fi
	progress_row_width=$(text_width "$row")
}
begin_step() {
	failure_key='error.unexpected'; step=$((step + 1)); stage=$(message "$1")
	stage_units=0; stage_total=$2; stage_percent=0
	if [[ -t 1 ]]; then render_progress; else render_progress '' true; fi
}
advance_step() { stage_units=$((stage_units + 1)); stage_percent=$((100 * stage_units / stage_total)); ((stage_percent < 100)) || stage_percent=99; render_progress; }
complete_step() { stage_percent=100; render_progress "$progress_done_state" true; }
initialize_progress_columns

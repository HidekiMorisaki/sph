# Native PowerShell progress; percentages count completed work, never elapsed time.
$progressRowVisible = $false
$progressRowWidth = 0
$stageUnits = 0
$stageTotalUnits = 1
$stagePercent = 0
function Get-InstallerTextWidth([string]$Text) { return $Text.Length + [regex]::Matches($Text, '[^\x20-\x7e]').Count }
function Initialize-InstallerProgressColumns {
	$script:progressLabelWidth = 0; $script:progressStateWidth = 0
	$script:progressRunningState = Get-InstallerMessage 'progress.running'
	$script:progressDoneState = Get-InstallerMessage 'progress.done'
	$script:progressStoppedState = Get-InstallerMessage 'progress.stoppedState'
	foreach ($phase in @('environment', 'setup', 'build', 'start', 'check', 'cleanup', 'final')) {
		$script:progressLabelWidth = [Math]::Max($progressLabelWidth, (Get-InstallerTextWidth (Get-InstallerMessage ('stage.' + $phase))))
	}
	foreach ($state in @(($progressRunningState + ' |'), $progressDoneState, $progressStoppedState)) {
		$script:progressStateWidth = [Math]::Max($progressStateWidth, (Get-InstallerTextWidth $state))
	}
}
function Clear-InstallerProgress {
	if ($script:progressRowVisible) {
		Write-Host ("`r" + (' ' * $script:progressRowWidth) + "`r") -NoNewline
		$script:progressRowVisible = $false
	}
}
function Show-InstallerProgress([string]$State = '', [int]$Frame = 0, [switch]$Permanent, [int]$Columns = 0) {
	if ($step -lt 1) { return }
	if (-not $interactive -and -not $Permanent) { return }
	Clear-InstallerProgress
	if (-not $State) { $State = $progressRunningState + ' ' + @('|', '/', '-', '\')[$Frame % 4] }
	$isStopped = $State -eq $progressStoppedState
	$overall = [int][Math]::Floor((($step - 1) * 100 + $stagePercent) / 7)
	if ($Columns -lt 40) {
		$Columns = 120
		try { if ([Console]::WindowWidth -ge 40) { $Columns = [Console]::WindowWidth } } catch {}
	}
	$template = 'progress.line'
	if ($columns -lt 64) { $template = 'progress.compact' }
	$stageNumber = '{0,3}' -f $stagePercent; $overallNumber = '{0,3}' -f $overall
	# Reserve the same visual columns for every phase, including full-width Japanese.
	$labelWidth = $progressLabelWidth
	$State += ' ' * [Math]::Max(0, ($progressStateWidth - (Get-InstallerTextWidth $State)))
	$fixed = Get-InstallerTextWidth (Get-InstallerMessage $template @([string]$step, '', '', $stageNumber, '', $overallNumber, $State))
	$labelWidth = [Math]::Min($labelWidth, [Math]::Max(0, ($columns - $fixed - 1 - 8)))
	$label = $stage
	while ((Get-InstallerTextWidth $label) -gt $labelWidth) {
		$label = $label.Substring(0, $label.Length - 1)
	}
	$label += ' ' * ($labelWidth - (Get-InstallerTextWidth $label))
	$fixed += $labelWidth
	# Prefer broad equal bars, leaving one column to prevent automatic wrapping.
	$width = [Math]::Max(1, [Math]::Min(60, [Math]::Floor(($columns - $fixed - 1) / 2)))
	$filled = [int][Math]::Floor($width * $stagePercent / 100)
	$overallFilled = [int][Math]::Floor($width * $overall / 100)
	$bar = ('=' * $filled) + ('-' * ($width - $filled))
	$overallBar = ('=' * $overallFilled) + ('-' * ($width - $overallFilled))
	$row = Get-InstallerMessage $template @([string]$step, $label, $bar, $stageNumber, $overallBar, $overallNumber, $State)
	$color = 'Blue'; if ($stagePercent -eq 100) { $color = 'Green' }
	if ($isStopped) { $color = 'Red' }
	if ($lightBackground) { $color = 'Dark' + $color }
	if ($useColor) { Write-Host $row -ForegroundColor $color -NoNewline:(-not $Permanent) }
	else { Write-Host $row -NoNewline:(-not $Permanent) }
	$script:progressRowWidth = Get-InstallerTextWidth $row
	$script:progressRowVisible = -not $Permanent
}
function Start-Step([string]$Key, [int]$Units) {
	$script:failureKey = 'error.unexpected'
	$script:step++
	$script:stage = Get-InstallerMessage $Key
	$script:stageUnits = 0; $script:stageTotalUnits = $Units; $script:stagePercent = 0
	Show-InstallerProgress -Permanent:(-not $interactive)
}
function Advance-Step {
	$script:stageUnits++
	$script:stagePercent = [Math]::Min(99, [int][Math]::Floor(100 * $stageUnits / $stageTotalUnits))
	Show-InstallerProgress
}
function Complete-Step {
	$script:stagePercent = 100
	Show-InstallerProgress -State $progressDoneState -Permanent
}
Initialize-InstallerProgressColumns

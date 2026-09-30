[CmdletBinding()]
param([string]$BackupRoot)

. (Join-Path $PSScriptRoot 'maintenance-common.ps1')

Push-Location $script:RepositoryRoot
try {
	Assert-MaintenancePrerequisites
	$backupDirectory = New-SphFullBackup -BackupRoot $BackupRoot
	Write-Host "Verified full backup created: $backupDirectory"
	Write-Host 'Keep this directory private. It contains authentication and application data.'
} finally {
	Pop-Location
}

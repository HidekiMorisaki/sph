[CmdletBinding()]
param([string]$BackupRoot)

. (Join-Path $PSScriptRoot 'maintenance-common.ps1')

Push-Location $script:RepositoryRoot
$servicesStopped = $false
$sourceUpdated = $false
$backupDirectory = $null
try {
	Assert-MaintenancePrerequisites
	$workingTree = Invoke-ExternalCommand -FilePath 'git' -Arguments @('-C', $script:RepositoryRoot, 'status', '--porcelain') -Capture
	if ($workingTree) { throw 'The Git working tree must be clean before updating.' }
	Invoke-ExternalCommand -FilePath 'git' -Arguments @('-C', $script:RepositoryRoot, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}') -Capture | Out-Null
	$previousCommit = Invoke-ExternalCommand -FilePath 'git' -Arguments @('-C', $script:RepositoryRoot, 'rev-parse', 'HEAD') -Capture
	$previousVersion = (Get-Content -LiteralPath (Join-Path $script:RepositoryRoot 'VERSION') -Raw).Trim()
	Assert-DatabaseReady

	Write-Host 'Stopping application services to prevent writes during the update backup...'
	Invoke-Compose -Arguments @('stop', 'gateway', 'frontend', 'api')
	$servicesStopped = $true
	$backupDirectory = New-SphFullBackup -BackupRoot $BackupRoot
	Write-Host "Verified update backup: $backupDirectory"

	Invoke-ExternalCommand -FilePath 'git' -Arguments @('-C', $script:RepositoryRoot, 'pull', '--ff-only')
	$currentCommit = Invoke-ExternalCommand -FilePath 'git' -Arguments @('-C', $script:RepositoryRoot, 'rev-parse', 'HEAD') -Capture
	$sourceUpdated = $currentCommit -ne $previousCommit

	Invoke-Compose -Arguments @('rm', '--force', '--stop', 'migration')
	Invoke-Compose -Arguments @('build')
	Invoke-Compose -Arguments @('run', '--rm', '--no-deps', '--volume', "${backupDirectory}:/baseline-backup", 'migration', 'node', 'scripts/baseline-existing.mjs', '/baseline-backup/manifest.json', '--if-legacy')
	Invoke-Compose -Arguments @('up', '-d', '--no-build')
	Wait-MigrationSucceeded
	Wait-ComposeServiceHealthy -Service 'api'
	Wait-ComposeServiceHealthy -Service 'frontend'
	Assert-RunningVersion

	$manifestPath = Join-Path $backupDirectory 'manifest.json'
	$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
	$manifest | Add-Member -NotePropertyName update -NotePropertyValue ([ordered]@{
		completedAtUtc = [DateTime]::UtcNow.ToString('o')
		fromVersion = $previousVersion
		fromCommit = $previousCommit
		toVersion = (Get-Content -LiteralPath (Join-Path $script:RepositoryRoot 'VERSION') -Raw).Trim()
		toCommit = $currentCommit
		status = 'succeeded'
	}) -Force
	[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 6) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
	Write-Host "Update completed successfully. Backup retained at: $backupDirectory"
} catch {
	if ($servicesStopped -and -not $sourceUpdated) {
		try {
			Invoke-Compose -Arguments @('start', 'api', 'frontend', 'gateway')
			Write-Warning 'The previous application containers were restarted because the source revision was not changed.'
		} catch {
			Write-Warning 'The previous application containers could not be restarted automatically.'
		}
	}
	if ($backupDirectory) {
		Write-Warning "The verified backup remains at: $backupDirectory"
		Write-Warning "Do not restore it automatically. Diagnose the failure first, then use restore.ps1 only when recovery is required."
	}
	throw
} finally {
	Pop-Location
}

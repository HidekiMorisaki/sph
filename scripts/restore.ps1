[CmdletBinding()]
param(
	[Parameter(Mandatory)][string]$BackupPath,
	[string]$ConfirmDatabaseName
)

. (Join-Path $PSScriptRoot 'maintenance-common.ps1')

Push-Location $script:RepositoryRoot
$containerArchive = $null
$destructiveRestoreStarted = $false
try {
	Assert-MaintenancePrerequisites
	$backupDirectory = (Resolve-Path -LiteralPath $BackupPath -ErrorAction Stop).Path
	if (-not (Test-Path -LiteralPath $backupDirectory -PathType Container)) { throw 'BackupPath must identify a backup directory.' }
	$manifestPath = Join-Path $backupDirectory 'manifest.json'
	if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'The backup manifest is missing.' }
	$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
	if ($manifest.formatVersion -ne 1 -or $manifest.application -ne 'SME Portal Hub' -or $manifest.archiveFormat -ne 'postgresql-custom' -or $manifest.verifiedRestore -ne $true) {
		throw 'The backup manifest is invalid or was not restore-verified.'
	}
	if ($manifest.archiveFile -notmatch '^[A-Za-z0-9._-]+$') { throw 'The backup archive name is invalid.' }
	if ($manifest.sha256 -notmatch '^[0-9a-f]{64}$') { throw 'The backup archive checksum is invalid.' }
	$archivePath = Join-Path $backupDirectory $manifest.archiveFile
	if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) { throw 'The backup archive is missing.' }
	$actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
	if ($actualHash -ne $manifest.sha256) { throw 'The backup archive checksum does not match its manifest.' }

	Assert-DatabaseReady
	$identity = Get-DatabaseIdentity
	if ($manifest.databaseName -ne $identity.Database) { throw 'The backup database name does not match the configured target database.' }
	$confirmation = if ($ConfirmDatabaseName) { "RESTORE $ConfirmDatabaseName" } else { Read-Host "This replaces all data in $($identity.Database). Type RESTORE $($identity.Database) to continue" }
	if ($confirmation -cne "RESTORE $($identity.Database)") { throw 'Restore confirmation did not match. No data was changed.' }

	$containerId = Get-ComposeContainerId -Service 'db'
	$containerArchive = "/tmp/sph-restore-$([Guid]::NewGuid().ToString('N')).dump"
	Invoke-ExternalCommand -FilePath 'docker' -Arguments @('cp', $archivePath, "${containerId}:$containerArchive")
	Invoke-Compose -Arguments @('exec', '-T', 'db', 'sh', '-c', "pg_restore --list $containerArchive >/dev/null")

	Write-Host 'Stopping application services before the destructive database restore...'
	Invoke-Compose -Arguments @('stop', 'gateway', 'frontend', 'api')
	$destructiveRestoreStarted = $true
	Invoke-Compose -Arguments @('exec', '-T', 'db', 'sh', '-c', "dropdb --force --if-exists --username=`"`$POSTGRES_USER`" $($identity.Database)")
	Invoke-Compose -Arguments @('exec', '-T', 'db', 'sh', '-c', "createdb --username=`"`$POSTGRES_USER`" $($identity.Database)")
	Invoke-Compose -Arguments @('exec', '-T', 'db', 'sh', '-c', "pg_restore --exit-on-error --no-owner --no-privileges --username=`"`$POSTGRES_USER`" --dbname=$($identity.Database) $containerArchive")

	Invoke-Compose -Arguments @('build', 'migration', 'api', 'frontend')
	Invoke-Compose -Arguments @('run', '--rm', '--no-deps', 'migration')
	$invalidateSql = "UPDATE sessions SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL; UPDATE password_reset_tokens SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL; UPDATE account_invitations SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL;"
	Invoke-Compose -Arguments @('exec', '-T', 'db', 'psql', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--username', $identity.User, '--dbname', $identity.Database, '--command', $invalidateSql)
	Invoke-Compose -Arguments @('up', '-d', '--no-deps', '--force-recreate', 'api', 'frontend')
	Wait-ComposeServiceHealthy -Service 'api'
	Wait-ComposeServiceHealthy -Service 'frontend'
	Invoke-Compose -Arguments @('up', '-d', '--no-deps', 'gateway')
	Assert-RunningVersion
	Write-Host 'Restore completed successfully. All restored sessions, password-reset tokens, and account invitations were invalidated.'
} catch {
	Write-Error $_
	if ($destructiveRestoreStarted) { Write-Warning 'The destructive restore started, so application services were intentionally left stopped unless recovery completed successfully.' }
	throw
} finally {
	if ($containerArchive) {
		try { Invoke-Compose -Arguments @('exec', '-T', 'db', 'sh', '-c', "rm -f $containerArchive") } catch { }
	}
	Pop-Location
}

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:RepositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path

function Invoke-ExternalCommand {
	param(
		[Parameter(Mandatory)][string]$FilePath,
		[string[]]$Arguments = @(),
		[switch]$Capture
	)
	if ($Capture) {
		$output = & $FilePath @Arguments 2>&1
		$exitCode = $LASTEXITCODE
		if ($exitCode -ne 0) { throw "$FilePath failed with exit code $exitCode." }
		return ($output -join "`n").Trim()
	}
	& $FilePath @Arguments
	if ($LASTEXITCODE -ne 0) { throw "$FilePath failed with exit code $LASTEXITCODE." }
}

function Invoke-Compose {
	param([string[]]$Arguments = @(), [switch]$Capture)
	return Invoke-ExternalCommand -FilePath 'docker' -Arguments (@('compose') + $Arguments) -Capture:$Capture
}

function Assert-MaintenancePrerequisites {
	foreach ($command in @('git', 'docker')) {
		if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "$command is required." }
	}
	Invoke-Compose -Arguments @('version') -Capture | Out-Null
	Invoke-Compose -Arguments @('config', '--quiet')
	if (-not (Test-Path -LiteralPath (Join-Path $script:RepositoryRoot '.env') -PathType Leaf)) { throw '.env is required in the repository root.' }
	Get-CredentialEncryptionKeyFingerprint | Out-Null
}

function Get-CredentialEncryptionKeyFingerprint {
	$envPath = Join-Path $script:RepositoryRoot '.env'
	$lines = @(Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^IT_ASSET_CREDENTIAL_ENCRYPTION_KEY=' })
	if ($lines.Count -ne 1) { throw 'IT_ASSET_CREDENTIAL_ENCRYPTION_KEY must be configured exactly once in .env.' }
	$value = $lines[0].Substring($lines[0].IndexOf('=') + 1).Trim()
	if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) { $value = $value.Substring(1, $value.Length - 2) }
	if ($value -notmatch '^[A-Za-z0-9_-]{43}$') { throw 'IT_ASSET_CREDENTIAL_ENCRYPTION_KEY must be a canonical base64url-encoded 32-byte key.' }
	$hash = [Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($value))
	return [Convert]::ToHexString($hash).ToLowerInvariant()
}

function Get-ComposeContainerId {
	param([Parameter(Mandatory)][string]$Service)
	return (Invoke-Compose -Arguments @('ps', '-q', $Service) -Capture).Trim()
}

function Wait-ComposeServiceHealthy {
	param([Parameter(Mandatory)][string]$Service, [int]$TimeoutSeconds = 120)
	$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
	do {
		$containerId = Get-ComposeContainerId -Service $Service
		if ($containerId) {
			$status = Invoke-ExternalCommand -FilePath 'docker' -Arguments @('inspect', '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}', $containerId) -Capture
			if ($status -eq 'healthy' -or $status -eq 'running') { return }
			if ($status -eq 'unhealthy' -or $status -eq 'exited' -or $status -eq 'dead') { throw "$Service entered the $status state." }
		}
		Start-Sleep -Seconds 1
	} while ((Get-Date) -lt $deadline)
	throw "Timed out waiting for $Service to become healthy."
}

function Assert-DatabaseReady {
	$containerId = Get-ComposeContainerId -Service 'db'
	if (-not $containerId) { Invoke-Compose -Arguments @('up', '-d', 'db') }
	Wait-ComposeServiceHealthy -Service 'db'
}

function Get-DatabaseIdentity {
	$output = Invoke-Compose -Arguments @('exec', '-T', 'db', 'sh', '-c', 'printf "%s\n%s\n" "$POSTGRES_DB" "$POSTGRES_USER"') -Capture
	$lines = @($output -split "`r?`n")
	if ($lines.Count -ne 2 -or $lines[0] -notmatch '^[A-Za-z_][A-Za-z0-9_]*$' -or $lines[1] -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
		throw 'The configured PostgreSQL database or user name is not safe for maintenance automation.'
	}
	return @{ Database = $lines[0]; User = $lines[1] }
}

function Get-DatabaseScalar {
	param([Parameter(Mandatory)][string]$Database, [Parameter(Mandatory)][string]$User, [Parameter(Mandatory)][string]$Sql)
	return (Invoke-Compose -Arguments @('exec', '-T', 'db', 'psql', '--no-psqlrc', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', '--username', $User, '--dbname', $Database, '--command', $Sql) -Capture).Trim()
}

function Get-DefaultBackupRoot {
	return Join-Path (Split-Path -Parent $script:RepositoryRoot) 'sph-backups'
}

function Resolve-BackupRoot {
	param([string]$BackupRoot)
	$requested = if ($BackupRoot) { $BackupRoot } else { Get-DefaultBackupRoot }
	$fullPath = [IO.Path]::GetFullPath($requested, $script:RepositoryRoot)
	$repositoryPrefix = $script:RepositoryRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
	if ($fullPath.Equals($script:RepositoryRoot, [StringComparison]::OrdinalIgnoreCase) -or $fullPath.StartsWith($repositoryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
		throw 'Backups must be stored outside the Git repository.'
	}
	[IO.Directory]::CreateDirectory($fullPath) | Out-Null
	return $fullPath
}

function New-SphFullBackup {
	param([string]$BackupRoot)
	Assert-DatabaseReady
	$identity = Get-DatabaseIdentity
	$resolvedRoot = Resolve-BackupRoot -BackupRoot $BackupRoot
	$version = (Get-Content -LiteralPath (Join-Path $script:RepositoryRoot 'VERSION') -Raw).Trim()
	$commit = Invoke-ExternalCommand -FilePath 'git' -Arguments @('-C', $script:RepositoryRoot, 'rev-parse', 'HEAD') -Capture
	$timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
	$backupId = "sph-$version-$timestamp"
	$backupDirectory = Join-Path $resolvedRoot $backupId
	$archivePath = Join-Path $backupDirectory 'database.dump'
	$manifestPath = Join-Path $backupDirectory 'manifest.json'
	$containerArchive = "/tmp/$backupId.dump"
	$verificationDatabase = "$($identity.Database)_backup_verify"
	$credentialKeyFingerprint = Get-CredentialEncryptionKeyFingerprint
	if ($verificationDatabase -notmatch '^[A-Za-z_][A-Za-z0-9_]*_backup_verify$') { throw 'The verification database name is invalid.' }
	if (Test-Path -LiteralPath $backupDirectory) { throw "The backup directory already exists: $backupDirectory" }
	[IO.Directory]::CreateDirectory($backupDirectory) | Out-Null
	$verified = $false
	try {
		$dumpCommand = "pg_dump --format=custom --compress=9 --file=$containerArchive --username=`"`$POSTGRES_USER`" `"`$POSTGRES_DB`""
		Invoke-Compose -Arguments @('exec', '-T', 'db', 'sh', '-c', $dumpCommand)
		Invoke-Compose -Arguments @('exec', '-T', 'db', 'sh', '-c', "pg_restore --list $containerArchive >/dev/null")
		$containerId = Get-ComposeContainerId -Service 'db'
		Invoke-ExternalCommand -FilePath 'docker' -Arguments @('cp', "${containerId}:$containerArchive", $archivePath)
		if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf) -or (Get-Item -LiteralPath $archivePath).Length -le 0) { throw 'The backup archive was not created.' }

		$cleanupVerification = "dropdb --force --if-exists --username=`"`$POSTGRES_USER`" $verificationDatabase"
		Invoke-Compose -Arguments @('exec', '-T', 'db', 'sh', '-c', $cleanupVerification)
		Invoke-Compose -Arguments @('exec', '-T', 'db', 'sh', '-c', "createdb --username=`"`$POSTGRES_USER`" $verificationDatabase")
		Invoke-Compose -Arguments @('exec', '-T', 'db', 'sh', '-c', "pg_restore --exit-on-error --no-owner --no-privileges --username=`"`$POSTGRES_USER`" --dbname=$verificationDatabase $containerArchive")
		$sourceTables = Get-DatabaseScalar -Database $identity.Database -User $identity.User -Sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"
		$targetTables = Get-DatabaseScalar -Database $verificationDatabase -User $identity.User -Sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"
		$sourceMigrations = Get-DatabaseScalar -Database $identity.Database -User $identity.User -Sql 'SELECT COUNT(*) FROM "_prisma_migrations";'
		$targetMigrations = Get-DatabaseScalar -Database $verificationDatabase -User $identity.User -Sql 'SELECT COUNT(*) FROM "_prisma_migrations";'
		if ($sourceTables -ne $targetTables -or $sourceMigrations -ne $targetMigrations) { throw 'The restored verification database does not match the source database structure.' }
		$verified = $true

		$serverVersion = Get-DatabaseScalar -Database $identity.Database -User $identity.User -Sql 'SHOW server_version;'
		$hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
		$manifest = [ordered]@{
			formatVersion = 1
			application = 'SME Portal Hub'
			backupId = $backupId
			createdAtUtc = [DateTime]::UtcNow.ToString('o')
			productVersion = $version
			sourceCommit = $commit
			databaseName = $identity.Database
			postgresVersion = $serverVersion
			archiveFile = 'database.dump'
			archiveFormat = 'postgresql-custom'
			sha256 = $hash
			credentialEncryptionKeyFingerprint = $credentialKeyFingerprint
			verifiedRestore = $true
		}
		[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 4) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
		return $backupDirectory
	} catch {
		if (-not $verified -and (Test-Path -LiteralPath $backupDirectory)) {
			Remove-Item -LiteralPath $archivePath, $manifestPath -Force -ErrorAction SilentlyContinue
			Remove-Item -LiteralPath $backupDirectory -Force -ErrorAction SilentlyContinue
		}
		throw
	} finally {
		try { Invoke-Compose -Arguments @('exec', '-T', 'db', 'sh', '-c', "rm -f $containerArchive") } catch { }
		try { Invoke-Compose -Arguments @('exec', '-T', 'db', 'sh', '-c', "dropdb --force --if-exists --username=`"`$POSTGRES_USER`" $verificationDatabase") } catch { }
	}
}

function Wait-MigrationSucceeded {
	param([int]$TimeoutSeconds = 180)
	$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
	do {
		$containerId = Get-ComposeContainerId -Service 'migration'
		if ($containerId) {
			$state = Invoke-ExternalCommand -FilePath 'docker' -Arguments @('inspect', '--format', '{{.State.Status}} {{.State.ExitCode}}', $containerId) -Capture
			if ($state -eq 'exited 0') { return }
			if ($state -match '^exited ') { throw "Migration failed ($state)." }
		}
		Start-Sleep -Seconds 1
	} while ((Get-Date) -lt $deadline)
	throw 'Timed out waiting for the migration job.'
}

function Assert-RunningVersion {
	param([int]$TimeoutSeconds = 180)
	$expectedVersion = (Get-Content -LiteralPath (Join-Path $script:RepositoryRoot 'VERSION') -Raw).Trim()
	$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
	do {
		try {
			$response = Invoke-RestMethod -Uri 'http://localhost:3000/v1/health' -Method Get -TimeoutSec 5
			if ($response.status -eq 'success' -and $response.responseCode -eq 200 -and $response.data.healthy -eq $true -and $response.data.version -eq $expectedVersion) { return }
		} catch { }
		Start-Sleep -Seconds 2
	} while ((Get-Date) -lt $deadline)
	throw "The running system did not report version $expectedVersion as healthy."
}

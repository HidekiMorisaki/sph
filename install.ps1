# Windows PowerShell 5.1 or later. No host Node.js installation is required.
param([switch]$WaitAtExit)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# Bootstrap resources are generated at development time; only PowerShell is needed here.
try {
	$languageMenu = . (Join-Path $PSScriptRoot 'scripts/locales/generated/languages.ps1')
	$selection = 0
	while ($selection -lt 1 -or $selection -gt $languageMenu.Codes.Count) {
		$lightBackground = [Console]::BackgroundColor -in @('Gray', 'White') -or $env:COLORFGBG -match '(?:^|;)(?:7|15)$'
		$menuColor = -not [Console]::IsOutputRedirected -and -not (Test-Path Env:NO_COLOR) -and $env:TERM -ne 'dumb'
		if ($menuColor) {
			Write-Host $languageMenu.Menu -ForegroundColor $(if ($lightBackground) { 'DarkBlue' } else { 'Blue' })
			Write-Host ($languageMenu.Label + ' ') -ForegroundColor $(if ($lightBackground) { 'DarkCyan' } else { 'Cyan' }) -NoNewline
			Write-Host '[1]' -ForegroundColor $(if ($lightBackground) { 'DarkMagenta' } else { 'Magenta' }) -NoNewline
			$language = Read-Host ' '
		} else { Write-Host $languageMenu.Menu; $language = Read-Host $languageMenu.Prompt }
		if (-not $language) { $language = '1' }
		if (-not [int]::TryParse($language, [ref]$selection)) { $selection = 0 }
	}
	$locale = $languageMenu.Codes[$selection - 1]
	$installerMessages = . (Join-Path $PSScriptRoot "scripts/locales/generated/$locale.ps1")
} catch { Write-Host 'Installer language files are missing or invalid. Extract the complete release again before running the installer.'; exit 1 }
function Get-InstallerMessage([string]$Key, [string[]]$Values = @()) {
	if (-not $installerMessages.ContainsKey($Key)) { throw 'Missing installer translation.' }
	return [regex]::Replace($installerMessages[$Key], '\{([1-9][0-9]*)\}', [System.Text.RegularExpressions.MatchEvaluator]{
		param($match)
		$position = [int]$match.Groups[1].Value - 1
		if ($position -ge $Values.Count) { throw 'Missing translation parameter.' }
		return $Values[$position]
	})
}
$interactive = -not [Console]::IsOutputRedirected
$useColor = $interactive -and -not (Test-Path Env:NO_COLOR) -and $env:TERM -ne 'dumb'
$step = 0
$stage = ''
$failureKey = 'error.unexpected'
$failureValues = @()
$probeDirectory = $null
$probeContainer = $null
$preflightFailures = 0
$holidayWarnings = @()
$bookWarnings = @()
function Stop-Installation([string]$Key, [string[]]$Values = @()) { $script:failureKey = $Key; $script:failureValues = $Values; throw 'Installation failed.' }
function Write-InstallerLine([string]$Text, [string]$Color = '', [switch]$Inline) {
	Clear-InstallerProgress
	if ($lightBackground -and $Color -in @('Cyan', 'Blue', 'Magenta', 'Green', 'Yellow', 'Red')) { $Color = 'Dark' + $Color }
	if ($useColor -and $Color) { Write-Host $Text -ForegroundColor $Color -NoNewline:$Inline }
	else { Write-Host $Text -NoNewline:$Inline }
}
try { . (Join-Path $PSScriptRoot 'scripts/install-progress.ps1') }
catch { Write-Host (Get-InstallerMessage 'error.releaseFiles'); exit 1 }
function Confirm-InstallerCapacity([string]$Label, $Current, [int]$Recommended, [string]$Warning, [string]$Unknown) {
	if ($null -ne $Current -and $Current -ge $Recommended) {
		Write-InstallerLine (Get-InstallerMessage 'preflight.pass' @((Get-InstallerMessage $Label))) Green
		Advance-Step
		return
	}
	Write-InstallerLine (Get-InstallerMessage 'preflight.warning' @((Get-InstallerMessage $Label))) Yellow
	if ($null -eq $Current) { Write-InstallerLine (Get-InstallerMessage $Unknown @([string]$Recommended)) Yellow }
	else { Write-InstallerLine (Get-InstallerMessage $Warning @([string]$Recommended, ([double]$Current).ToString('0.#', [Globalization.CultureInfo]::InvariantCulture))) Yellow }
	Write-InstallerLine (Get-InstallerMessage 'confirm.continue') Cyan
	Write-InstallerLine (Get-InstallerMessage 'prompt.option' @('1', (Get-InstallerMessage 'confirm.yes'))) Blue
	Write-InstallerLine (Get-InstallerMessage 'prompt.option' @('2', (Get-InstallerMessage 'confirm.no'))) Blue
	while ($true) {
		Write-InstallerLine ((Get-InstallerMessage 'input.selectNumber') + ' ') Cyan -Inline
		Write-InstallerLine '[2]' Magenta -Inline
		$answer = [string](Read-Host ' ')
		if ($answer.Trim() -eq '1') { Advance-Step; return }
		if ($answer.Trim() -in @('', '2')) { Stop-Installation 'error.cancelled' }
		Write-InstallerLine (Get-InstallerMessage 'input.invalid') Yellow
	}
}
function Invoke-DockerCaptured([string[]]$CommandArguments, [int]$TimeoutSeconds = 60) {
	$job = Start-Job -ScriptBlock {
		param($Directory, $DockerArguments)
		Set-Location -LiteralPath $Directory
		$ErrorActionPreference = 'Continue'
		$result = & docker @DockerArguments 2>&1
		[pscustomobject]@{ Code = $LASTEXITCODE; Output = ($result -join "`n") }
	} -ArgumentList $PSScriptRoot, $CommandArguments
	$elapsed = [Diagnostics.Stopwatch]::StartNew()
	try {
		while ($job.State -eq 'Running' -or $job.State -eq 'NotStarted') {
			if ($elapsed.Elapsed.TotalSeconds -ge $TimeoutSeconds) { Stop-Installation 'error.timeout' }
			Wait-Job $job -Timeout 1 | Out-Null
		}
		$result = @(Receive-Job $job -ErrorAction SilentlyContinue)
		if ($job.State -ne 'Completed' -or $result.Count -ne 1 -or $result[0].Code -ne 0) { throw 'Docker operation failed.' }
		return $result[0].Output
	} finally {
		if ($job.State -eq 'Running') { Stop-Job $job -ErrorAction SilentlyContinue }
		Remove-Job $job -Force -ErrorAction SilentlyContinue
	}
}
function Invoke-DockerProgress([string[]]$CommandArguments, [int]$TimeoutSeconds = 1800) {
	# Background Docker execution keeps progress updating without exposing its output.
	$job = Start-Job -ScriptBlock {
		param($Directory, $DockerArguments)
		Set-Location -LiteralPath $Directory
		$ErrorActionPreference = 'Continue'
		& docker @DockerArguments *> $null
		$LASTEXITCODE
	} -ArgumentList $PSScriptRoot, $CommandArguments
	$elapsed = [Diagnostics.Stopwatch]::StartNew()
	$frame = 0
	try {
		while ($job.State -eq 'Running' -or $job.State -eq 'NotStarted') {
			if ($elapsed.Elapsed.TotalSeconds -ge $TimeoutSeconds) { Stop-Installation 'error.timeout' }
			Show-InstallerProgress -Frame $frame
			$frame++
			Wait-Job $job -Timeout 1 | Out-Null
		}
		$code = @(Receive-Job $job -ErrorAction SilentlyContinue)
		if ($job.State -ne 'Completed' -or $code.Count -ne 1 -or $code[0] -ne 0) { throw 'Docker operation failed.' }
		Advance-Step
	} finally {
		if ($job.State -eq 'Running') { Stop-Job $job -ErrorAction SilentlyContinue }
		Remove-Job $job -Force -ErrorAction SilentlyContinue
	}
}
function Protect-File([string]$Path) {
	if ($env:OS -eq 'Windows_NT') {
		$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
		& icacls $Path /inheritance:r /grant:r "*$($sid):(F)" '*S-1-5-18:(F)' '*S-1-5-32-544:(F)' 2>&1 | Out-Null
		if ($LASTEXITCODE -ne 0) { Stop-Installation 'error.permissions' }
	}
}
function Invoke-InstallerMaintenance([string]$Operation) {
	Invoke-DockerCaptured -CommandArguments @('run', '--rm', '--add-host', 'host.docker.internal:host-gateway', '--mount', "type=bind,source=$PSScriptRoot,target=/workspace", '--workdir', '/workspace', 'node:22-alpine', 'node', 'scripts/install-maintenance.mjs', $Operation)
}
$savedEnvironment = @{}
$compose = @('compose', '-f', 'docker-compose.local.yml', '--env-file', '.env', '-p', 'sph')
Push-Location $PSScriptRoot
try {
	Write-InstallerLine "`n  ================================================" Cyan
	Write-InstallerLine '     SME Portal Hub' Cyan
	Write-InstallerLine ('     ' + (Get-InstallerMessage 'title')) Cyan
	Write-InstallerLine '  ================================================' Cyan
	Write-InstallerLine (Get-InstallerMessage 'progress.notice')
	Start-Step 'stage.environment' 13
	function Test-InstallerCheck([string]$Label, [string]$ErrorKey, [scriptblock]$Action, [bool]$Available = $true) {
		if (-not $Available) { Write-InstallerLine (Get-InstallerMessage 'preflight.skip' @((Get-InstallerMessage $Label))) Yellow; Advance-Step; return $false }
		$script:failureKey = $ErrorKey
		try { & $Action | Out-Null; Write-InstallerLine (Get-InstallerMessage 'preflight.pass' @((Get-InstallerMessage $Label))) Green; Advance-Step; return $true }
		catch {
			$script:preflightFailures++
			Write-InstallerLine (Get-InstallerMessage 'preflight.fail' @((Get-InstallerMessage $Label))) Red
			Write-InstallerLine (Get-InstallerMessage $script:failureKey $script:failureValues) Red
			Advance-Step
			return $false
		}
	}
	if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) { Stop-Installation 'error.terminal' }
	$fresh = Test-InstallerCheck 'check.fresh' 'error.existingConfiguration' { if (Test-Path -LiteralPath '.env') { throw 'Existing configuration.' } }
	$files = Test-InstallerCheck 'check.files' 'error.releaseFiles' {
		foreach ($file in [IO.File]::ReadAllLines((Join-Path $PSScriptRoot 'scripts/install-required-files.txt'))) {
			$stream = [IO.File]::OpenRead((Join-Path $PSScriptRoot $file)); $stream.Dispose()
		}
	}
	$writable = Test-InstallerCheck 'check.write' 'error.writeFolder' {
		$token = [Guid]::NewGuid().ToString('N')
		$script:probeDirectory = Join-Path $PSScriptRoot ('.sph-preflight-' + $token)
		[IO.Directory]::CreateDirectory($probeDirectory) | Out-Null
		$first = Join-Path $probeDirectory 'first'; $second = Join-Path $probeDirectory 'second'
		[IO.File]::WriteAllText($first, $token)
		Protect-File $first
		[IO.File]::Move($first, $second)
		if ([IO.File]::ReadAllText($second) -ne $token) { throw 'Read back failed.' }
		[IO.File]::Delete($second)
		[IO.Directory]::CreateDirectory((Join-Path $probeDirectory 'host-test')) | Out-Null
		[IO.Directory]::Delete((Join-Path $probeDirectory 'host-test'))
		[IO.File]::WriteAllText((Join-Path $probeDirectory 'token'), $token)
	}
	$docker = Test-InstallerCheck 'check.docker' 'error.dockerRequired' { if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Missing Docker.' } }
	$connected = Test-InstallerCheck 'check.connection' 'error.dockerConnection' { Invoke-DockerCaptured @('info') } $docker
	$composeReady = Test-InstallerCheck 'check.compose' 'error.compose' {
		$version = Invoke-DockerCaptured @('compose', 'version', '--short')
		if ($version.Trim() -notmatch '^v?([2-9]|[1-9][0-9]+)\.') { throw 'Unsupported Compose.' }
	} $docker
	$buildReady = Test-InstallerCheck 'check.build' 'error.buildSupport' { Invoke-DockerCaptured @('buildx', 'version') } $docker
	$linux = Test-InstallerCheck 'check.linux' 'error.linuxContainers' {
		if ((Invoke-DockerCaptured @('info', '--format', '{{.OSType}}')).Trim() -ne 'linux') { throw 'Linux containers required.' }
	} $connected
	$resources = Test-InstallerCheck 'check.resources' 'error.docker' {
		$volumes = (Invoke-DockerCaptured @('volume', 'ls', '--format', '{{.Name}}')) -split "`n"
		$containers = (Invoke-DockerCaptured @('ps', '-a', '--format', '{{.Names}}')) -split "`n"
		if (@($volumes | Where-Object { $_ -in @('sph-db-data', 'sph-gateway-data', 'sph-gateway-config') }).Count -gt 0 -or @($containers | Where-Object { $_ -in @('sph-db', 'sph-api', 'sph-frontend', 'sph-gateway', 'sph-migration') }).Count -gt 0) { Stop-Installation 'error.existingResources' }
	} ($connected -and $fresh)
	if ($preflightFailures -gt 0) { Stop-Installation 'error.preflight' }
	$failureKey = 'error.pull'
	Invoke-DockerProgress @('pull', 'node:22-alpine') -TimeoutSeconds 300
	$failureKey = 'error.workspace'
	$probeContainer = 'sph-preflight-' + [Guid]::NewGuid().ToString('N')
	$probeLeaf = [IO.Path]::GetFileName($probeDirectory)
	$token = [IO.File]::ReadAllText((Join-Path $probeDirectory 'token'))
	$capacity = (Invoke-DockerCaptured @('run', '--rm', '--name', $probeContainer, '--network', 'none', '--mount', "type=bind,source=$PSScriptRoot,target=/workspace", '--workdir', '/workspace', 'node:22-alpine', 'node', 'scripts/install-preflight.mjs', $probeLeaf, $token)) | ConvertFrom-Json
	Write-InstallerLine (Get-InstallerMessage 'preflight.pass' @((Get-InstallerMessage 'check.workspace'))) Green
	Advance-Step
	$disk = $null
	if ($null -ne $capacity.freeGiB -and $capacity.freeGiB -ge 0) { $disk = [double]$capacity.freeGiB }
	Confirm-InstallerCapacity 'check.disk' $disk 10 'warning.disk' 'warning.diskUnknown'
	$memory = $null
	try {
		$detectedMemory = [double](Invoke-DockerCaptured @('info', '--format', '{{.MemTotal}}')) / 1GB
		if ($detectedMemory -gt 0 -and -not [double]::IsInfinity($detectedMemory)) { $memory = [Math]::Floor($detectedMemory * 10) / 10 }
	} catch { $memory = $null }
	Confirm-InstallerCapacity 'check.memory' $memory 4 'warning.memory' 'warning.memoryUnknown'
	$keys = @('APP_ORIGIN', 'HTTP_PORT', 'GATEWAY_TLS_MODE', 'GATEWAY_HTTP_PUBLISH', 'GATEWAY_HTTPS_PUBLISH', 'ACME_EMAIL', 'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST', 'POSTGRES_PORT', 'CORS_ALLOWED_ORIGINS', 'IT_ASSET_CREDENTIAL_ENCRYPTION_KEY') + @(Get-ChildItem Env: | Where-Object Name -Like 'INITIAL_ADMIN_*' | Select-Object -ExpandProperty Name)
	foreach ($key in $keys) {
		$savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key)
		Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue
	}
	Complete-Step
	Start-Step 'stage.setup' 7
	$failureKey = 'error.setup'
	$hostIpv4 = ''
	$hostName = ''
	try {
		$hostIpv4 = @(
			foreach ($adapter in [Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
				if ($adapter.OperationalStatus -ne [Net.NetworkInformation.OperationalStatus]::Up) { continue }
				foreach ($entry in $adapter.GetIPProperties().UnicastAddresses) {
					if ($entry.Address.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork) { $entry.Address.IPAddressToString }
				}
			}
		) -join ','
		$hostName = [Net.Dns]::GetHostName()
	} catch { $hostIpv4 = ''; $hostName = '' }
	Clear-InstallerProgress
	$previousPreference = $ErrorActionPreference
	try {
		$ErrorActionPreference = 'Continue'
		& docker run --rm -it --network none -e NO_COLOR -e TERM -e "COLORFGBG=$(if ($lightBackground) { '0;15' } else { '15;0' })" -e "SPH_INSTALL_HOST_IPV4=$hostIpv4" -e "SPH_INSTALL_HOSTNAME=$hostName" --mount "type=bind,source=$PSScriptRoot,target=/workspace" --workdir /workspace node:22-alpine node scripts/install-config.mjs $locale 2>$null
	} finally { $ErrorActionPreference = $previousPreference }
	if ($LASTEXITCODE -ne 0) { Stop-Installation 'error.setup' }
	Advance-Step
	$failureKey = 'error.permissions'
	Protect-File (Join-Path $PSScriptRoot '.env')
	Advance-Step
	$failureKey = 'error.settings'
	$config = (Invoke-InstallerMaintenance 'settings') | ConvertFrom-Json
	Advance-Step
	$failureKey = 'error.composeConfig'
	Invoke-DockerCaptured ($compose + @('config', '--quiet')) | Out-Null
	Write-InstallerLine (Get-InstallerMessage 'preflight.pass' @((Get-InstallerMessage 'check.settings'))) Green
	Advance-Step
	$failureKey = 'error.ports'
	$portBindings = @('127.0.0.1:5432:5432')
	if ($config.mode -eq 'local') { $portBindings += "127.0.0.1:$($config.port):80"; $portBindings += '127.0.0.1::443' }
	elseif ($config.mode -eq 'internal-http') { $portBindings += "$(([uri]$config.origin).Host):$($config.port):80"; $portBindings += '127.0.0.1::443' }
	else { $portBindings += '80:80'; $portBindings += '443:443' }
	$failureValues = @(($portBindings -join ', '))
	$probeArguments = @('run', '--detach', '--rm', '--name', $probeContainer)
	foreach ($binding in $portBindings) { $probeArguments += @('--publish', $binding) }
	Invoke-DockerCaptured ($probeArguments + @('node:22-alpine', 'node', '-e', 'setTimeout(()=>{},60000)')) | Out-Null
	Invoke-DockerCaptured @('rm', '-f', $probeContainer) | Out-Null
	Write-InstallerLine (Get-InstallerMessage 'preflight.pass' @((Get-InstallerMessage 'check.ports'))) Green
	Advance-Step
	$failureValues = @()
	$failureKey = 'error.networkPreflight'
	Invoke-InstallerMaintenance 'preflight' | Out-Null
	Write-InstallerLine (Get-InstallerMessage 'preflight.pass' @((Get-InstallerMessage 'check.network'))) Green
	Advance-Step
	$failureKey = 'error.gatewayConfig'
	Invoke-InstallerMaintenance 'gateway-config' | Out-Null
	Advance-Step
	Complete-Step
	Start-Step 'stage.build' 1
	$failureKey = 'error.build'
	Invoke-DockerProgress -CommandArguments ($compose + @('build'))
	Complete-Step
	Start-Step 'stage.start' 3
	$failureKey = 'error.start'
	Invoke-DockerProgress -CommandArguments ($compose + @('up', '-d', '--no-build', '--wait', '--wait-timeout', '300'))
	$failureKey = 'error.migration'
	$migration = Invoke-DockerCaptured -CommandArguments @('inspect', '--format', '{{.State.Status}} {{.State.ExitCode}}', 'sph-migration')
	if ($migration.Trim() -ne 'exited 0') { Stop-Installation 'error.migration' }
	Advance-Step
	$migrationLog = Invoke-DockerCaptured -CommandArguments @('logs', 'sph-migration')
	foreach ($countryCode in @('JP', 'US')) {
		if (@($migrationLog -split '\r?\n' | Where-Object { $_ -ceq "SPH_SAMPLE_HOLIDAY_WARNING=$countryCode" }).Count -gt 0) { $holidayWarnings += $countryCode }
	}
	foreach ($kind in @('lookup', 'cover')) {
		if (@($migrationLog -split '\r?\n' | Where-Object { $_ -ceq "SPH_SAMPLE_BOOK_WARNING=$kind" }).Count -gt 0) { $bookWarnings += $kind }
	}
	$migrationLog = $null
	Advance-Step
	Complete-Step
	Start-Step 'stage.check' 2
	if ($config.mode -eq 'internal') {
		$failureKey = 'error.caExport'
		$certificateDirectory = Join-Path $PSScriptRoot '.runtime/ca'
		New-Item -ItemType Directory -Path $certificateDirectory -Force | Out-Null
		$certificate = Join-Path $certificateDirectory 'root.crt'
		for ($attempt = 0; $attempt -lt 30; $attempt++) {
			try { Invoke-DockerCaptured -CommandArguments @('cp', 'sph-gateway:/data/caddy/pki/authorities/local/root.crt', $certificate) | Out-Null; break }
			catch { if ($attempt -eq 29) { throw }; Start-Sleep -Seconds 1 }
		}
		if (-not (Test-Path -LiteralPath $certificate) -or (Get-Item -LiteralPath $certificate).Length -eq 0) { Stop-Installation 'error.caExport' }
	}
	Advance-Step
	$failureKey = 'error.health'
	Invoke-InstallerMaintenance 'check' | Out-Null
	Advance-Step
	Complete-Step
	Start-Step 'stage.cleanup' 7
	$failureKey = 'error.cleanup'
	Invoke-InstallerMaintenance 'prepare-cleanup' | Out-Null
	Advance-Step
	$clean = Join-Path $PSScriptRoot '.env.install-clean'
	$failureKey = 'error.permissions'
	Protect-File $clean
	Advance-Step
	$failureKey = 'error.cleanup'
	for ($attempt = 0; $attempt -lt 5; $attempt++) {
		try { [IO.File]::Replace($clean, (Join-Path $PSScriptRoot '.env'), [NullString]::Value); break }
		catch { if ($attempt -eq 4 -or $_.Exception.InnerException -isnot [IO.IOException]) { throw }; Start-Sleep -Milliseconds 100 }
	}
	Advance-Step
	$failureKey = 'error.permissions'
	Protect-File (Join-Path $PSScriptRoot '.env')
	Advance-Step
	$failureKey = 'error.removeMigration'
	Invoke-DockerCaptured -CommandArguments ($compose + @('rm', '-f', 'migration')) | Out-Null
	Advance-Step
	$failureKey = 'error.refreshDb'
	Invoke-DockerProgress -CommandArguments ($compose + @('up', '-d', '--no-build', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '300', 'db'))
	$failureKey = 'error.refreshApi'
	Invoke-DockerProgress -CommandArguments ($compose + @('up', '-d', '--no-build', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '300', 'api'))
	Complete-Step
	Start-Step 'stage.final' 4
	foreach ($name in @('sph-db', 'sph-api')) {
		$failureKey = 'error.inspectCredentials'
		$containerEnvironment = (Invoke-DockerCaptured -CommandArguments @('inspect', '--format', '{{json .Config.Env}}', $name)) | ConvertFrom-Json
		if (@($containerEnvironment | Where-Object { $_ -match '^INITIAL_ADMIN_' }).Count -gt 0) { Stop-Installation 'error.initialCredentials' }
		Advance-Step
	}
	$failureKey = 'error.health'
	Invoke-InstallerMaintenance 'check' | Out-Null
	Advance-Step
	try { Invoke-InstallerMaintenance 'public-check' | Out-Null }
	catch { Write-InstallerLine (Get-InstallerMessage 'warning.publicUrl') Yellow }
	Advance-Step
	Complete-Step
	Write-InstallerLine ("`n" + (Get-InstallerMessage 'complete' @($config.origin))) Green
	foreach ($countryCode in $holidayWarnings) { Write-InstallerLine (Get-InstallerMessage "warning.holiday$countryCode") Yellow }
	foreach ($kind in $bookWarnings) { Write-InstallerLine (Get-InstallerMessage "warning.book.$kind") Yellow }
	Write-InstallerLine (Get-InstallerMessage 'complete.notice')
} catch {
	Show-InstallerProgress -State (Get-InstallerMessage 'progress.stoppedState') -Permanent
	Write-InstallerLine (Get-InstallerMessage 'error.stoppedWindows') Red
	# Only trusted, localized context is displayed; native errors can contain secrets.
	Write-InstallerLine (Get-InstallerMessage $failureKey $failureValues) Red
	exit 1
} finally {
	if ($probeContainer) { try { Invoke-DockerCaptured @('rm', '-f', $probeContainer) | Out-Null } catch {} }
	if ($probeDirectory -and [IO.Directory]::Exists($probeDirectory)) {
		try {
			foreach ($leaf in @('first', 'second', 'token')) { [IO.File]::Delete((Join-Path $probeDirectory $leaf)) }
			$hostTest = Join-Path $probeDirectory 'host-test'
			if ([IO.Directory]::Exists($hostTest)) { [IO.Directory]::Delete($hostTest) }
			[IO.Directory]::Delete($probeDirectory)
		} catch { Write-InstallerLine (Get-InstallerMessage 'error.writeFolder') Yellow }
	}
	foreach ($key in $savedEnvironment.Keys) {
		if ($null -eq $savedEnvironment[$key]) { Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue }
		else { [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key]) }
	}
	Pop-Location
	if ($WaitAtExit) { Write-InstallerLine (Get-InstallerMessage 'exit.prompt') Cyan -Inline; Read-Host ' ' | Out-Null }
}

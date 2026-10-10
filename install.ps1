# Windows PowerShell 5.1 or later. No host Node.js installation is required.
param([switch]$WaitAtExit)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# Bootstrap resources are generated at development time; only PowerShell is needed here.
try {
	$languageMenu = . (Join-Path $PSScriptRoot 'scripts/locales/generated/languages.ps1')
	$selection = 0
	while ($selection -lt 1 -or $selection -gt $languageMenu.Codes.Count) {
		Write-Host $languageMenu.Menu
		$language = Read-Host $languageMenu.Prompt
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
$useColor = $interactive -and -not (Test-Path Env:NO_COLOR)
$timer = [Diagnostics.Stopwatch]::StartNew()
$step = 0
$stage = ''
$failureKey = 'error.unexpected'
$holidayWarnings = @()
function Stop-Installation([string]$Key) { $script:failureKey = $Key; throw 'Installation failed.' }
function Write-InstallerLine([string]$Text, [string]$Color = 'Gray', [switch]$Inline) {
	if ($useColor) { Write-Host $Text -ForegroundColor $Color -NoNewline:$Inline }
	else { Write-Host $Text -NoNewline:$Inline }
}
function Start-Step([string]$Key) {
	$script:failureKey = 'error.unexpected'
	$script:step++
	$script:stage = Get-InstallerMessage $Key
	$bar = ('=' * ($step - 1)) + '>' + ('.' * (7 - $step))
	Write-InstallerLine ("`n[{0}/7] [{1}] {2}" -f $step, $bar, $stage) Cyan
}
function Complete-Step { Write-InstallerLine (Get-InstallerMessage 'progress.complete' @($stage, $timer.Elapsed.ToString('mm\:ss'))) Green }
function Invoke-DockerCaptured([string[]]$CommandArguments) {
	$previousPreference = $ErrorActionPreference
	try { $ErrorActionPreference = 'Continue'; $result = & docker @CommandArguments 2>&1; $code = $LASTEXITCODE }
	finally { $ErrorActionPreference = $previousPreference }
	if ($code -ne 0) { throw 'Docker operation failed.' }
	return ($result -join "`n")
}
function Invoke-DockerProgress([string[]]$CommandArguments) {
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
			if ($interactive) { Write-InstallerLine ("`r  {0} {1} | {2:mm\:ss} | {3} {4:mm\:ss}               " -f @('|', '/', '-', '\')[$frame % 4], $stage, $elapsed.Elapsed, (Get-InstallerMessage 'progress.total'), $timer.Elapsed) Blue -Inline }
			$frame++
			Wait-Job $job -Timeout 1 | Out-Null
		}
		if ($interactive) { Write-Host '' }
		$code = @(Receive-Job $job -ErrorAction SilentlyContinue)
		if ($job.State -ne 'Completed' -or $code.Count -ne 1 -or $code[0] -ne 0) { throw 'Docker operation failed.' }
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
$compose = @('compose', '-f', 'docker-compose.yml', '--env-file', '.env', '-p', 'sph')
Push-Location $PSScriptRoot
try {
	Write-InstallerLine "`n  ================================================" Cyan
	Write-InstallerLine '     SME Portal Hub' Cyan
	Write-InstallerLine ('     ' + (Get-InstallerMessage 'title')) Cyan
	Write-InstallerLine '  ================================================' Cyan
	Write-InstallerLine (Get-InstallerMessage 'progress.notice')
	Start-Step 'stage.environment'
	if (Test-Path -LiteralPath '.env') { Stop-Installation 'error.existingConfiguration' }
	if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Stop-Installation 'error.dockerRequired' }
	$failureKey = 'error.dockerConnection'
	Invoke-DockerCaptured -CommandArguments @('info') | Out-Null
	$failureKey = 'error.compose'
	Invoke-DockerCaptured -CommandArguments @('compose', 'version') | Out-Null
	$failureKey = 'error.docker'
	$volumes = (Invoke-DockerCaptured -CommandArguments @('volume', 'ls', '--format', '{{.Name}}')) -split "`n"
	$containers = (Invoke-DockerCaptured -CommandArguments @('ps', '-a', '--format', '{{.Names}}')) -split "`n"
	if (@($volumes | Where-Object { $_ -in @('sph-db-data', 'sph-gateway-data', 'sph-gateway-config') }).Count -gt 0 -or @($containers | Where-Object { $_ -in @('sph-db', 'sph-api', 'sph-frontend', 'sph-gateway', 'sph-migration') }).Count -gt 0) { Stop-Installation 'error.existingResources' }
	$keys = @('APP_ORIGIN', 'HTTP_PORT', 'GATEWAY_TLS_MODE', 'GATEWAY_HTTP_PUBLISH', 'GATEWAY_HTTPS_PUBLISH', 'ACME_EMAIL', 'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST', 'POSTGRES_PORT', 'CORS_ALLOWED_ORIGINS', 'IT_ASSET_CREDENTIAL_ENCRYPTION_KEY') + @(Get-ChildItem Env: | Where-Object Name -Like 'INITIAL_ADMIN_*' | Select-Object -ExpandProperty Name)
	foreach ($key in $keys) {
		$savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key)
		Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue
	}
	Complete-Step
	Start-Step 'stage.setup'
	$failureKey = 'error.pull'
	Invoke-DockerProgress -CommandArguments @('pull', 'node:22-alpine')
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
	$previousPreference = $ErrorActionPreference
	try {
		$ErrorActionPreference = 'Continue'
		& docker run --rm -it --network none -e NO_COLOR -e TERM -e "SPH_INSTALL_HOST_IPV4=$hostIpv4" -e "SPH_INSTALL_HOSTNAME=$hostName" --mount "type=bind,source=$PSScriptRoot,target=/workspace" --workdir /workspace node:22-alpine node scripts/install-config.mjs $locale 2>$null
	} finally { $ErrorActionPreference = $previousPreference }
	if ($LASTEXITCODE -ne 0) { Stop-Installation 'error.setup' }
	$failureKey = 'error.permissions'
	Protect-File (Join-Path $PSScriptRoot '.env')
	$failureKey = 'error.settings'
	$config = (Invoke-InstallerMaintenance 'settings') | ConvertFrom-Json
	$failureKey = 'error.networkPreflight'
	Invoke-InstallerMaintenance 'preflight' | Out-Null
	$failureKey = 'error.gatewayConfig'
	Invoke-InstallerMaintenance 'gateway-config' | Out-Null
	Complete-Step
	Start-Step 'stage.build'
	$failureKey = 'error.build'
	Invoke-DockerProgress -CommandArguments ($compose + @('build'))
	Complete-Step
	Start-Step 'stage.start'
	$failureKey = 'error.start'
	Invoke-DockerProgress -CommandArguments ($compose + @('up', '-d', '--no-build', '--wait', '--wait-timeout', '300'))
	$failureKey = 'error.migration'
	$migration = Invoke-DockerCaptured -CommandArguments @('inspect', '--format', '{{.State.Status}} {{.State.ExitCode}}', 'sph-migration')
	if ($migration.Trim() -ne 'exited 0') { Stop-Installation 'error.migration' }
	$migrationLog = Invoke-DockerCaptured -CommandArguments @('logs', 'sph-migration')
	foreach ($countryCode in @('JP', 'US')) {
		if (@($migrationLog -split '\r?\n' | Where-Object { $_ -ceq "SPH_SAMPLE_HOLIDAY_WARNING=$countryCode" }).Count -gt 0) { $holidayWarnings += $countryCode }
	}
	$migrationLog = $null
	Complete-Step
	Start-Step 'stage.check'
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
	$failureKey = 'error.health'
	Invoke-InstallerMaintenance 'check' | Out-Null
	Complete-Step
	Start-Step 'stage.cleanup'
	$failureKey = 'error.cleanup'
	Invoke-InstallerMaintenance 'prepare-cleanup' | Out-Null
	$clean = Join-Path $PSScriptRoot '.env.install-clean'
	$failureKey = 'error.permissions'
	Protect-File $clean
	$failureKey = 'error.cleanup'
	for ($attempt = 0; $attempt -lt 5; $attempt++) {
		try { [IO.File]::Replace($clean, (Join-Path $PSScriptRoot '.env'), [NullString]::Value); break }
		catch { if ($attempt -eq 4 -or $_.Exception.InnerException -isnot [IO.IOException]) { throw }; Start-Sleep -Milliseconds 100 }
	}
	$failureKey = 'error.permissions'
	Protect-File (Join-Path $PSScriptRoot '.env')
	$failureKey = 'error.removeMigration'
	Invoke-DockerCaptured -CommandArguments ($compose + @('rm', '-f', 'migration')) | Out-Null
	$failureKey = 'error.refreshDb'
	Invoke-DockerProgress -CommandArguments ($compose + @('up', '-d', '--no-build', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '300', 'db'))
	$failureKey = 'error.refreshApi'
	Invoke-DockerProgress -CommandArguments ($compose + @('up', '-d', '--no-build', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '300', 'api'))
	Complete-Step
	Start-Step 'stage.final'
	foreach ($name in @('sph-db', 'sph-api')) {
		$failureKey = 'error.inspectCredentials'
		$containerEnvironment = (Invoke-DockerCaptured -CommandArguments @('inspect', '--format', '{{json .Config.Env}}', $name)) | ConvertFrom-Json
		if (@($containerEnvironment | Where-Object { $_ -match '^INITIAL_ADMIN_' }).Count -gt 0) { Stop-Installation 'error.initialCredentials' }
	}
	$failureKey = 'error.health'
	Invoke-InstallerMaintenance 'check' | Out-Null
	try { Invoke-InstallerMaintenance 'public-check' | Out-Null }
	catch { Write-InstallerLine (Get-InstallerMessage 'warning.publicUrl') Yellow }
	Complete-Step
	Write-InstallerLine ("`n" + (Get-InstallerMessage 'complete' @($config.origin))) Green
	foreach ($countryCode in $holidayWarnings) { Write-InstallerLine (Get-InstallerMessage "warning.holiday$countryCode") Yellow }
	Write-InstallerLine (Get-InstallerMessage 'complete.notice')
} catch {
	Write-InstallerLine (Get-InstallerMessage 'error.stoppedWindows') Red
	Write-InstallerLine ("[{0}/7] {1}" -f $step, $stage) Red
	# Only trusted, localized context is displayed; native errors can contain secrets.
	Write-InstallerLine (Get-InstallerMessage $failureKey) Red
	exit 1
} finally {
	foreach ($key in $savedEnvironment.Keys) {
		if ($null -eq $savedEnvironment[$key]) { Remove-Item -LiteralPath "Env:$key" -ErrorAction SilentlyContinue }
		else { [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key]) }
	}
	Pop-Location
	if ($WaitAtExit) { Read-Host (Get-InstallerMessage 'exit.prompt') | Out-Null }
}

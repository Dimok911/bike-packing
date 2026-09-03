[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-f]{40}$')]
  [string]$ExpectedCommit,
  [string]$ExpectedVersion = "",
  [string]$ArtifactRoot = "",
  [string]$IdentityFile = "",
  [string]$PublicUrl = "https://experiment.vniipo-help.ru/",
  [string]$ApiCapabilitiesUrl = "https://experiment.vniipo-help.ru/letters-vniipo/api/bike-packing/capabilities"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$OutputEncoding = [Text.UTF8Encoding]::new($false)

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path.TrimEnd("\")
if ([string]::IsNullOrWhiteSpace($ArtifactRoot)) {
  $ArtifactRoot = Join-Path $projectRoot "www\vniipo-help.ru\bike-packing"
}
if ([string]::IsNullOrWhiteSpace($IdentityFile)) {
  $IdentityFile = Join-Path ([Environment]::GetFolderPath("UserProfile")) ".ssh\codex_experiment_vniipo_ed25519"
}
$ArtifactRoot = (Resolve-Path $ArtifactRoot).Path.TrimEnd("\")
$IdentityFile = (Resolve-Path $IdentityFile).Path

$sshPath = (Get-Command ssh -ErrorAction Stop).Source
$scpPath = (Get-Command scp -ErrorAction Stop).Source
$tarPath = (Get-Command tar -ErrorAction Stop).Source
$curlPath = "C:\Windows\System32\curl.exe"
$server = "root@90.156.128.115"
$livePath = "/var/www/experiment"
$sharedPrefix = "assets/"
$sshOptions = @("-i", $IdentityFile, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes")

function Invoke-NativeChecked {
  param([string]$FilePath, [string[]]$Arguments, [string]$FailureMessage)
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$FailureMessage Exit code: $LASTEXITCODE" }
}

function Invoke-SshChecked {
  param([string[]]$RemoteArguments)
  $remoteScript = "/var/www/.experiment-upload-$script:releaseId/deploy-remote.sh"
  Invoke-NativeChecked $sshPath ($sshOptions + @($server, "/bin/bash", $remoteScript) + $RemoteArguments) "Experiment SSH command failed."
}

function Relative-Path([IO.FileInfo]$File) {
  $relative = $File.FullName.Substring($ArtifactRoot.Length + 1).Replace("\", "/")
  if ($relative -match '[\r\n\t]' -or $relative.StartsWith("/") -or $relative.Split("/") -contains "..") {
    throw "Artifact contains an unsafe path."
  }
  return $relative
}

function Write-Utf8Lines([string]$Path, [string[]]$Lines) {
  $content = if ($Lines.Count -gt 0) { ($Lines -join "`n") + "`n" } else { "" }
  [IO.File]::WriteAllText($Path, $content, [Text.UTF8Encoding]::new($false))
}

function Receive-HttpsFile([string]$Relative, [string]$Destination, [string]$CacheBuster) {
  $url = $PublicUrl.TrimEnd("/") + "/" + $Relative + "?release=" + $CacheBuster
  Invoke-NativeChecked $curlPath @(
    "--fail", "--silent", "--show-error", "--location",
    "--header", "Cache-Control: no-cache", "--output", $Destination, $url
  ) "HTTPS download failed for $Relative."
}

function Receive-AbsoluteHttpsFile([string]$Url, [string]$Destination) {
  Invoke-NativeChecked $curlPath @(
    "--fail", "--silent", "--show-error", "--location",
    "--header", "Cache-Control: no-cache", "--output", $Destination, $Url
  ) "HTTPS download failed for $Url."
}

function Assert-ExperimentApiContract([string]$ContractPath, [string]$TemporaryDirectory, [string]$CacheBuster) {
  $contract = Get-Content -LiteralPath $ContractPath -Raw | ConvertFrom-Json
  $requiredVersion = [string]$contract.requiredApiCompatibilityVersion
  $requiredCapabilities = @($contract.requiredApiCapabilities | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ })
  if ([int]$contract.schemaVersion -ne 1 -or [string]::IsNullOrWhiteSpace($requiredVersion)) {
    throw "Release API contract is missing or invalid."
  }
  if ([string]$contract.appVersion -ne $ExpectedVersion) {
    throw "Release API contract belongs to $($contract.appVersion), expected $ExpectedVersion."
  }

  $separator = if ($ApiCapabilitiesUrl.Contains("?")) { "&" } else { "?" }
  $livePath = Join-Path $TemporaryDirectory "experiment-api-capabilities.json"
  Receive-AbsoluteHttpsFile "$ApiCapabilitiesUrl${separator}release=$CacheBuster" $livePath
  $live = Get-Content -LiteralPath $livePath -Raw | ConvertFrom-Json
  $liveVersion = [string]$live.apiCompatibilityVersion
  if ($liveVersion -ne $requiredVersion) {
    throw "Experiment API compatibility mismatch: frontend requires $requiredVersion, live API reports $liveVersion. Experiment was not changed."
  }
  $available = @{}
  @($live.capabilities) | ForEach-Object { $available[[string]$_] = $true }
  $missing = @($requiredCapabilities | Where-Object { -not $available.ContainsKey($_) })
  if ($missing.Count -gt 0) {
    throw "Experiment API is missing required capabilities: $($missing -join ', '). Experiment was not changed."
  }
  return [pscustomobject]@{ Version = $liveVersion; CapabilityCount = $requiredCapabilities.Count }
}

function Https-TemporaryFileName([string]$Relative) {
  $hex = [Convert]::ToHexString([Text.Encoding]::UTF8.GetBytes($Relative))
  return $hex.Substring(0, [Math]::Min(16, $hex.Length)) + ".bin"
}

function Assert-Hash([string]$Expected, [string]$Actual, [string]$Label) {
  $left = (Get-FileHash -LiteralPath $Expected -Algorithm SHA256).Hash
  $right = (Get-FileHash -LiteralPath $Actual -Algorithm SHA256).Hash
  if ($left -ne $right) { throw "SHA-256 mismatch for $Label." }
}

foreach ($required in @("index.html", "app.js", "release-contract.json", "styles.css", "sw.js", "manifest.webmanifest")) {
  if (-not (Test-Path -LiteralPath (Join-Path $ArtifactRoot $required) -PathType Leaf)) {
    throw "Experiment artifact is incomplete; missing $required."
  }
}
$head = (& git -C $projectRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $ExpectedCommit) { throw "Expected commit is not the checked-out HEAD." }
if (@(& git -C $projectRoot status --porcelain --untracked-files=no).Count -ne 0) {
  throw "Experiment deployment requires a clean tracked working tree."
}

$html = Get-Content -LiteralPath (Join-Path $ArtifactRoot "index.html") -Raw
$match = [regex]::Match($html, 'app\.js\?v=(\d+)')
if (-not $match.Success) { throw "Cannot resolve the application version from index.html." }
$versionNumber = $match.Groups[1].Value
$artifactVersion = "v$versionNumber"
if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) { $ExpectedVersion = $artifactVersion }
if ($ExpectedVersion -ne $artifactVersion -or $html -notmatch ('styles\.css\?v=' + [regex]::Escape($versionNumber))) {
  throw "Expected version does not match the built app.js/styles.css version."
}

$safeVersion = $ExpectedVersion -replace '[^A-Za-z0-9._-]', '-'
$timestamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
$releaseId = "$safeVersion-$($ExpectedCommit.Substring(0, 10))-$timestamp"
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) "bike-packing-experiment-deploy-$PID-$timestamp"
New-Item -Path $temporaryRoot -ItemType Directory | Out-Null
$activated = $false
$rollbackVerified = $false

try {
  $apiContractVerification = Assert-ExperimentApiContract `
    (Join-Path $ArtifactRoot "release-contract.json") `
    $temporaryRoot `
    $releaseId
  $entries = @(Get-ChildItem -LiteralPath $ArtifactRoot -Recurse -File | ForEach-Object {
    [pscustomobject]@{
      Path = Relative-Path $_
      Hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      Size = $_.Length
      FullName = $_.FullName
    }
  } | Sort-Object Path)
  $sharedEntries = @($entries | Where-Object Path -like "$sharedPrefix*")
  $frontendEntries = @($entries | Where-Object Path -notlike "$sharedPrefix*")
  if ($sharedEntries.Count -eq 0) { throw "Static build assets are missing from the build." }

  $remoteLines = @(& $sshPath @sshOptions $server "cd '$livePath' && find -L . -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum")
  if ($LASTEXITCODE -ne 0) { throw "Could not read the current Experiment manifest." }
  $remoteHashes = @{}
  foreach ($line in $remoteLines) {
    if ($line -notmatch '^(?<hash>[0-9a-f]{64})  \./(?<path>.+)$') { throw "Unexpected live manifest format." }
    $remoteHashes[$Matches.path] = $Matches.hash
  }
  $changedEntries = @($entries | Where-Object { -not $remoteHashes.ContainsKey($_.Path) -or $remoteHashes[$_.Path] -ne $_.Hash })
  $reusedEntries = @($entries | Where-Object { $remoteHashes.ContainsKey($_.Path) -and $remoteHashes[$_.Path] -eq $_.Hash })
  $changedFrontend = @($changedEntries | Where-Object Path -notlike "$sharedPrefix*")
  $changedShared = @($changedEntries | Where-Object Path -like "$sharedPrefix*")

  Write-Utf8Lines (Join-Path $temporaryRoot "all.sha256") @($entries | ForEach-Object { "$($_.Hash)  $($_.Path)" })
  Write-Utf8Lines (Join-Path $temporaryRoot "all.paths") @($entries.Path)
  Write-Utf8Lines (Join-Path $temporaryRoot "frontend.sha256") @($frontendEntries | ForEach-Object { "$($_.Hash)  $($_.Path)" })
  Write-Utf8Lines (Join-Path $temporaryRoot "frontend.paths") @($frontendEntries.Path)
  Write-Utf8Lines (Join-Path $temporaryRoot "assets.sha256") @($sharedEntries | ForEach-Object { "$($_.Hash)  $($_.Path.Substring($sharedPrefix.Length))" })
  Write-Utf8Lines (Join-Path $temporaryRoot "assets.paths") @($sharedEntries | ForEach-Object { $_.Path.Substring($sharedPrefix.Length) })
  Write-Utf8Lines (Join-Path $temporaryRoot "frontend.changed") @($changedFrontend.Path)
  Write-Utf8Lines (Join-Path $temporaryRoot "assets.changed") @($changedShared | ForEach-Object { $_.Path.Substring($sharedPrefix.Length) })

  Invoke-NativeChecked $tarPath @("-cf", (Join-Path $temporaryRoot "frontend.tar"), "-C", $ArtifactRoot, "-T", (Join-Path $temporaryRoot "frontend.changed")) "Could not create frontend delta."
  Invoke-NativeChecked $tarPath @("-cf", (Join-Path $temporaryRoot "assets.tar"), "-C", (Join-Path $ArtifactRoot "assets"), "-T", (Join-Path $temporaryRoot "assets.changed")) "Could not create static asset delta."
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot "deploy-experiment-vps-remote.sh") -Destination (Join-Path $temporaryRoot "deploy-remote.sh")

  $uploadPath = "/var/www/.experiment-upload-$releaseId"
  Invoke-NativeChecked $sshPath ($sshOptions + @($server, "mkdir", $uploadPath)) "Could not create the remote upload directory."
  $uploadFiles = @(Get-ChildItem -LiteralPath $temporaryRoot -File | ForEach-Object FullName)
  Invoke-NativeChecked $scpPath ($sshOptions + $uploadFiles + @("${server}:$uploadPath/")) "Could not upload the Experiment delta."

  $frontendBytes = ($frontendEntries | Measure-Object Size -Sum).Sum
  $sharedBytes = ($sharedEntries | Measure-Object Size -Sum).Sum
  $allBytes = ($entries | Measure-Object Size -Sum).Sum
  Invoke-SshChecked @("stage", $releaseId, "$($frontendEntries.Count)", "$frontendBytes", "$($sharedEntries.Count)", "$sharedBytes")
  Invoke-SshChecked @("activate", $releaseId, "$($entries.Count)", "$allBytes")
  $activated = $true

  $publicDir = Join-Path $temporaryRoot "https"
  New-Item -Path $publicDir -ItemType Directory | Out-Null
  $publicPaths = @("index.html", "app.js", "release-contract.json", "styles.css", "sw.js")
  $reusedStatic = $reusedEntries | Where-Object Path -like "$sharedPrefix*" | Select-Object -First 1
  $changedStaticSample = $changedShared | Select-Object -First 1
  if ($null -ne $reusedStatic) { $publicPaths += $reusedStatic.Path }
  if ($null -ne $changedStaticSample) { $publicPaths += $changedStaticSample.Path }
  foreach ($relative in $publicPaths | Select-Object -Unique) {
    $name = Https-TemporaryFileName $relative
    $download = Join-Path $publicDir $name
    Receive-HttpsFile $relative $download $releaseId
    Assert-Hash (Join-Path $ArtifactRoot $relative.Replace("/", "\")) $download "HTTPS/$relative"
  }
  $indexName = Https-TemporaryFileName "index.html"
  $publicHtml = Get-Content -LiteralPath (Join-Path $publicDir $indexName) -Raw
  if ($publicHtml -notmatch ('app\.js\?v=' + [regex]::Escape($versionNumber))) { throw "Public Experiment exposes the wrong version." }
  Invoke-SshChecked @("cleanup", $releaseId)
}
catch {
  $deploymentError = $_
  if ($activated) {
    try {
      Invoke-SshChecked @("rollback", $releaseId)
      $rollbackDir = Join-Path $temporaryRoot "rollback"
      New-Item -Path $rollbackDir -ItemType Directory -Force | Out-Null
      foreach ($relative in @("index.html", "app.js", "styles.css", "sw.js")) {
        Receive-HttpsFile $relative (Join-Path $rollbackDir $relative) "rollback-$timestamp"
      }
      Invoke-SshChecked @("cleanup-rollback", $releaseId)
      $rollbackVerified = $true
    } catch {
      throw "Experiment deployment failed and automatic rollback could not be verified. Original error: $deploymentError"
    }
  }
  if (-not $activated) {
    try { Invoke-SshChecked @("abort", $releaseId) } catch { }
  }
  if ($rollbackVerified) { throw "Experiment deployment failed; the previous release was restored. Original error: $deploymentError" }
  throw $deploymentError
}
finally {
  $tempParent = (Split-Path $temporaryRoot -Parent).TrimEnd("\")
  if ($tempParent -ne ([IO.Path]::GetTempPath()).TrimEnd("\") -or (Split-Path $temporaryRoot -Leaf) -notlike "bike-packing-experiment-deploy-*") {
    throw "Unsafe temporary cleanup target."
  }
  if (Test-Path -LiteralPath $temporaryRoot) { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force }
}

[pscustomobject]@{
  Version = $ExpectedVersion
  Commit = $ExpectedCommit
  TotalFiles = $entries.Count
  TotalBytes = $allBytes
  ReusedFiles = $reusedEntries.Count
  UploadedFiles = $changedEntries.Count
  PersistentAssets = "/var/www/experiment-shared/assets"
  FrontendBackup = "/var/www/experiment-backup-before-$releaseId"
  FullSha256 = "verified"
  PublicHttps = "verified"
  ExperimentApiVersion = $apiContractVerification.Version
  ExperimentApiCapabilities = $apiContractVerification.CapabilityCount
} | Format-List

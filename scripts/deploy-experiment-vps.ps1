[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-f]{40}$')]
  [string]$ExpectedCommit,
  [string]$ExpectedVersion = "",
  [string]$ArtifactRoot = "",
  [string]$IdentityFile = "",
  [string]$PublicUrl = "https://experiment.vniipo-help.ru/"
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
$catalogPrefix = "assets/manufacturer-catalog/"
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
  [IO.File]::WriteAllLines($Path, $Lines, [Text.UTF8Encoding]::new($false))
}

function Receive-HttpsFile([string]$Relative, [string]$Destination, [string]$CacheBuster) {
  $url = $PublicUrl.TrimEnd("/") + "/" + $Relative + "?release=" + $CacheBuster
  Invoke-NativeChecked $curlPath @(
    "--fail", "--silent", "--show-error", "--location",
    "--header", "Cache-Control: no-cache", "--output", $Destination, $url
  ) "HTTPS download failed for $Relative."
}

function Assert-Hash([string]$Expected, [string]$Actual, [string]$Label) {
  $left = (Get-FileHash -LiteralPath $Expected -Algorithm SHA256).Hash
  $right = (Get-FileHash -LiteralPath $Actual -Algorithm SHA256).Hash
  if ($left -ne $right) { throw "SHA-256 mismatch for $Label." }
}

foreach ($required in @("index.html", "app.js", "styles.css", "sw.js", "manifest.webmanifest")) {
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
  $entries = @(Get-ChildItem -LiteralPath $ArtifactRoot -Recurse -File | ForEach-Object {
    [pscustomobject]@{
      Path = Relative-Path $_
      Hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      Size = $_.Length
      FullName = $_.FullName
    }
  } | Sort-Object Path)
  $catalogEntries = @($entries | Where-Object Path -like "$catalogPrefix*")
  $frontendEntries = @($entries | Where-Object Path -notlike "$catalogPrefix*")
  if ($catalogEntries.Count -eq 0) { throw "Manufacturer catalog assets are missing from the build." }

  $remoteLines = @(& $sshPath @sshOptions $server "cd '$livePath' && find -L . -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum")
  if ($LASTEXITCODE -ne 0) { throw "Could not read the current Experiment manifest." }
  $remoteHashes = @{}
  foreach ($line in $remoteLines) {
    if ($line -notmatch '^(?<hash>[0-9a-f]{64})  \./(?<path>.+)$') { throw "Unexpected live manifest format." }
    $remoteHashes[$Matches.path] = $Matches.hash
  }
  $changedEntries = @($entries | Where-Object { -not $remoteHashes.ContainsKey($_.Path) -or $remoteHashes[$_.Path] -ne $_.Hash })
  $reusedEntries = @($entries | Where-Object { $remoteHashes.ContainsKey($_.Path) -and $remoteHashes[$_.Path] -eq $_.Hash })
  $changedFrontend = @($changedEntries | Where-Object Path -notlike "$catalogPrefix*")
  $changedCatalog = @($changedEntries | Where-Object Path -like "$catalogPrefix*")

  Write-Utf8Lines (Join-Path $temporaryRoot "all.sha256") @($entries | ForEach-Object { "$($_.Hash)  $($_.Path)" })
  Write-Utf8Lines (Join-Path $temporaryRoot "all.paths") @($entries.Path)
  Write-Utf8Lines (Join-Path $temporaryRoot "frontend.sha256") @($frontendEntries | ForEach-Object { "$($_.Hash)  $($_.Path)" })
  Write-Utf8Lines (Join-Path $temporaryRoot "frontend.paths") @($frontendEntries.Path)
  Write-Utf8Lines (Join-Path $temporaryRoot "catalog.sha256") @($catalogEntries | ForEach-Object { "$($_.Hash)  $($_.Path.Substring($catalogPrefix.Length))" })
  Write-Utf8Lines (Join-Path $temporaryRoot "catalog.paths") @($catalogEntries | ForEach-Object { $_.Path.Substring($catalogPrefix.Length) })
  Write-Utf8Lines (Join-Path $temporaryRoot "frontend.changed") @($changedFrontend.Path)
  Write-Utf8Lines (Join-Path $temporaryRoot "catalog.changed") @($changedCatalog | ForEach-Object { $_.Path.Substring($catalogPrefix.Length) })

  Invoke-NativeChecked $tarPath @("-cf", (Join-Path $temporaryRoot "frontend.tar"), "-C", $ArtifactRoot, "-T", (Join-Path $temporaryRoot "frontend.changed")) "Could not create frontend delta."
  Invoke-NativeChecked $tarPath @("-cf", (Join-Path $temporaryRoot "catalog.tar"), "-C", (Join-Path $ArtifactRoot "assets\manufacturer-catalog"), "-T", (Join-Path $temporaryRoot "catalog.changed")) "Could not create catalog delta."
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot "deploy-experiment-vps-remote.sh") -Destination (Join-Path $temporaryRoot "deploy-remote.sh")

  $uploadPath = "/var/www/.experiment-upload-$releaseId"
  Invoke-NativeChecked $sshPath ($sshOptions + @($server, "mkdir", $uploadPath)) "Could not create the remote upload directory."
  $uploadFiles = @(Get-ChildItem -LiteralPath $temporaryRoot -File | ForEach-Object FullName)
  Invoke-NativeChecked $scpPath ($sshOptions + $uploadFiles + @("${server}:$uploadPath/")) "Could not upload the Experiment delta."

  $frontendBytes = ($frontendEntries | Measure-Object Size -Sum).Sum
  $catalogBytes = ($catalogEntries | Measure-Object Size -Sum).Sum
  $allBytes = ($entries | Measure-Object Size -Sum).Sum
  Invoke-SshChecked @("stage", $releaseId, "$($frontendEntries.Count)", "$frontendBytes", "$($catalogEntries.Count)", "$catalogBytes")
  Invoke-SshChecked @("activate", $releaseId, "$($entries.Count)", "$allBytes")
  $activated = $true

  $publicDir = Join-Path $temporaryRoot "https"
  New-Item -Path $publicDir -ItemType Directory | Out-Null
  $publicPaths = @("index.html", "app.js", "styles.css", "sw.js")
  $reusedCatalog = $reusedEntries | Where-Object Path -like "$catalogPrefix*" | Select-Object -First 1
  $changedCatalogSample = $changedCatalog | Select-Object -First 1
  if ($null -ne $reusedCatalog) { $publicPaths += $reusedCatalog.Path }
  if ($null -ne $changedCatalogSample) { $publicPaths += $changedCatalogSample.Path }
  foreach ($relative in $publicPaths | Select-Object -Unique) {
    $name = ([Convert]::ToHexString([Text.Encoding]::UTF8.GetBytes($relative))).Substring(0, 16) + ".bin"
    $download = Join-Path $publicDir $name
    Receive-HttpsFile $relative $download $releaseId
    Assert-Hash (Join-Path $ArtifactRoot $relative.Replace("/", "\")) $download "HTTPS/$relative"
  }
  $indexName = ([Convert]::ToHexString([Text.Encoding]::UTF8.GetBytes("index.html"))).Substring(0, 16) + ".bin"
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
  PersistentCatalog = "/var/www/experiment-shared/manufacturer-catalog"
  FrontendBackup = "/var/www/experiment-backup-before-$releaseId"
  FullSha256 = "verified"
  PublicHttps = "verified"
} | Format-List

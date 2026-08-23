[CmdletBinding()]
param(
  [string]$ExpectedVersion = "",
  [string]$ArtifactRoot = "",
  [string]$ConfigPath = "",
  [string]$PublicUrl = "https://vniipo-help.ru/bike-packing/"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path.TrimEnd("\")
if ([string]::IsNullOrWhiteSpace($ArtifactRoot)) {
  $ArtifactRoot = Join-Path $projectRoot "www\vniipo-help.ru\bike-packing"
}
if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
  $ConfigPath = Join-Path $projectRoot ".vscode\sftp.json"
}
$ArtifactRoot = (Resolve-Path $ArtifactRoot).Path.TrimEnd("\")
$ConfigPath = (Resolve-Path $ConfigPath).Path
$curlPath = "C:\Windows\System32\curl.exe"
$productionRemotePath = "www/vniipo-help.ru/bike-packing"
$productionParentPath = "www/vniipo-help.ru"
$ftpCanonicalHost = "vniipo-help.ru"
$ftpFallbackIp = "88.212.206.188"
$ftpPort = 21
$ftpPinnedPublicKey = "sha256//+gOwS0YQ8/CGtOD9zgyFzgYGLtl38K9YhxYssMpjz+Y="
if (-not (Test-Path -LiteralPath $curlPath -PathType Leaf)) {
  throw "Required curl.exe was not found at the project-approved path."
}

function Escape-CurlConfigValue([string]$value) {
  return $value.Replace("\", "\\").Replace('"', '\"').Replace("`r", "\r").Replace("`n", "\n")
}

function Curl-Line([string]$name, [string]$value) {
  return ('{0} = "{1}"' -f $name, (Escape-CurlConfigValue $value))
}

function Invoke-CurlConfig {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Lines,
    [switch]$Ftps,
    [ValidateRange(1, 10)]
    [int]$Attempts = 1
  )
  $effectiveLines = @($Lines)
  if ($Ftps) {
    $effectiveLines = @(
      "ssl-reqd"
      "insecure"
      "ftp-pasv"
      (Curl-Line "pinnedpubkey" $ftpPinnedPublicKey)
      (Curl-Line "resolve" "${ftpCanonicalHost}:${ftpPort}:${ftpFallbackIp}")
    ) + $effectiveLines
  }
  for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
    (($effectiveLines -join "`n") + "`n") | & $curlPath --config -
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0) { return 0 }
    if ($attempt -lt $Attempts) {
      Write-Warning "Transfer attempt $attempt of $Attempts failed; retrying."
      Start-Sleep -Seconds 2
    }
  }
  return $exitCode
}

$settings = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
foreach ($name in @("host", "username", "password", "remotePath")) {
  if ([string]::IsNullOrWhiteSpace([string]$settings.$name)) {
    throw "Missing required FTP setting: $name"
  }
}
if ([string]$settings.protocol -ne "ftp") {
  throw "Production deployment requires protocol=ftp in .vscode/sftp.json."
}
if (([string]$settings.remotePath).Trim() -ne "/") {
  throw "The FTP account root configuration has changed; remotePath must remain '/'."
}
if ([int]$settings.port -ne $ftpPort) {
  throw "Production FTPS requires port 21."
}
if ([string]$settings.host -notin @($ftpCanonicalHost, $ftpFallbackIp)) {
  throw "Production FTPS host must remain vniipo-help.ru or its approved fallback IP."
}

$ftpAccountRootUrl = "ftp://${ftpCanonicalHost}:${ftpPort}/"
$credential = ([string]$settings.username) + ":" + ([string]$settings.password)

function Encode-RemotePath([string]$relativePath) {
  return (($relativePath.Replace("\", "/").TrimStart("/").Split("/") | ForEach-Object {
    [Uri]::EscapeDataString($_)
  }) -join "/")
}

function Get-FtpUrl([string]$accountRelativePath) {
  return $ftpAccountRootUrl + (Encode-RemotePath $accountRelativePath)
}

function Send-FtpFile([string]$localPath, [string]$accountRelativePath) {
  $exitCode = Invoke-CurlConfig -Ftps -Attempts 5 -Lines @(
    "silent"
    "show-error"
    "fail"
    "ftp-create-dirs"
    (Curl-Line "user" $credential)
    (Curl-Line "url" (Get-FtpUrl $accountRelativePath))
    (Curl-Line "upload-file" $localPath)
  )
  if ($exitCode -ne 0) { throw "FTP upload failed for: $accountRelativePath" }
}

function Receive-FtpFile([string]$accountRelativePath, [string]$localPath) {
  $parent = Split-Path -Path $localPath -Parent
  if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -Path $parent -ItemType Directory -Force | Out-Null
  }
  $exitCode = Invoke-CurlConfig -Ftps -Attempts 5 -Lines @(
    "silent"
    "show-error"
    "fail"
    (Curl-Line "user" $credential)
    (Curl-Line "url" (Get-FtpUrl $accountRelativePath))
    (Curl-Line "output" $localPath)
  )
  if ($exitCode -ne 0) { throw "FTP download failed for: $accountRelativePath" }
}

function Move-FtpDirectory([string]$fromPath, [string]$toPath) {
  $exitCode = Invoke-CurlConfig -Ftps -Lines @(
    "silent"
    "show-error"
    "fail"
    (Curl-Line "user" $credential)
    (Curl-Line "url" $ftpAccountRootUrl)
    (Curl-Line "output" "NUL")
    (Curl-Line "quote" "RNFR $fromPath")
    (Curl-Line "quote" "RNTO $toPath")
  )
  if ($exitCode -ne 0) { throw "FTP directory rename failed." }
}

function Assert-FilesEqual([string]$expectedPath, [string]$actualPath, [string]$label) {
  $expectedHash = (Get-FileHash -LiteralPath $expectedPath -Algorithm SHA256).Hash
  $actualHash = (Get-FileHash -LiteralPath $actualPath -Algorithm SHA256).Hash
  if ($expectedHash -ne $actualHash) { throw "SHA-256 mismatch for: $label" }
}

function Get-RelativeArtifactPath([System.IO.FileInfo]$file) {
  return $file.FullName.Substring($ArtifactRoot.Length + 1).Replace("\", "/")
}

function Receive-HttpsFile([string]$url, [string]$localPath, [int]$attempts = 5) {
  $parent = Split-Path -Path $localPath -Parent
  if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -Path $parent -ItemType Directory -Force | Out-Null
  }
  for ($attempt = 1; $attempt -le $attempts; $attempt += 1) {
    $exitCode = Invoke-CurlConfig -Lines @(
      "silent"
      "show-error"
      "fail"
      (Curl-Line "header" "Cache-Control: no-cache")
      (Curl-Line "url" $url)
      (Curl-Line "output" $localPath)
    )
    if ($exitCode -eq 0) { return }
    if ($attempt -lt $attempts) { Start-Sleep -Seconds 2 }
  }
  throw "HTTPS verification failed after $attempts attempts."
}

function Assert-PublicBuild([string]$baseUrl, [string]$temporaryDirectory, [string]$cacheBuster) {
  $publicBase = $baseUrl.TrimEnd("/")
  foreach ($relative in @("index.html", "app.js", "styles.css", "sw.js")) {
    $publicPath = Join-Path $temporaryDirectory $relative
    Receive-HttpsFile "${publicBase}/${relative}?release=$cacheBuster" $publicPath
    Assert-FilesEqual (Join-Path $ArtifactRoot $relative) $publicPath "HTTPS/$relative"
  }
  $publicHtml = Get-Content -LiteralPath (Join-Path $temporaryDirectory "index.html") -Raw
  $publicSw = Get-Content -LiteralPath (Join-Path $temporaryDirectory "sw.js") -Raw
  if ($publicHtml -notmatch ('app\.js\?v=' + [regex]::Escape($script:versionNumber)) -or
      $publicHtml -notmatch ('styles\.css\?v=' + [regex]::Escape($script:versionNumber))) {
    throw "HTTPS index.html does not expose the expected asset version."
  }
  if ($publicSw -notmatch ('bike-packing-prototype-' + [regex]::Escape($ExpectedVersion))) {
    throw "HTTPS sw.js does not expose the expected cache version."
  }
}

$artifactFiles = @(Get-ChildItem -Path $ArtifactRoot -Recurse -File)
foreach ($requiredFile in @("app.js", "index.html", "index.php", "manifest.webmanifest", "styles.css", "sw.js")) {
  if (-not (Test-Path -LiteralPath (Join-Path $ArtifactRoot $requiredFile) -PathType Leaf)) {
    throw "Production artifact is incomplete; missing $requiredFile."
  }
}

$artifactHtml = Get-Content -LiteralPath (Join-Path $ArtifactRoot "index.html") -Raw
$versionMatch = [regex]::Match($artifactHtml, 'app\.js\?v=(\d+)')
if (-not $versionMatch.Success) { throw "Cannot resolve the application version from production index.html." }
$versionNumber = $versionMatch.Groups[1].Value
$artifactVersion = "v$versionNumber"
if ([string]::IsNullOrWhiteSpace($ExpectedVersion)) { $ExpectedVersion = $artifactVersion }
if ($ExpectedVersion -ne $artifactVersion) {
  throw "Expected version $ExpectedVersion does not match artifact version $artifactVersion."
}
if ($artifactHtml -notmatch ('styles\.css\?v=' + [regex]::Escape($versionNumber))) {
  throw "Production index.html has mismatched app.js and styles.css versions."
}

$safeVersion = $ExpectedVersion -replace '[^A-Za-z0-9._-]', '-'
$timestamp = [DateTime]::UtcNow.ToString("yyyyMMddTHHmmssZ")
$stageLeaf = "bike-packing-stage-$safeVersion-$timestamp"
$backupLeaf = "bike-packing-backup-before-$safeVersion-$timestamp"
$failedLeaf = "bike-packing-failed-$safeVersion-$timestamp"
$stageRemotePath = "$productionParentPath/$stageLeaf"
$backupRemotePath = "$productionParentPath/$backupLeaf"
$failedRemotePath = "$productionParentPath/$failedLeaf"
$stagePublicUrl = "https://vniipo-help.ru/$stageLeaf/"
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) "bike-packing-ftp-deploy-$PID-$timestamp"
if (Test-Path -LiteralPath $temporaryRoot) { throw "Temporary deployment directory already exists." }
New-Item -Path $temporaryRoot -ItemType Directory | Out-Null

$productionMoved = $false
$stageActivated = $false
$rollbackCompleted = $false

try {
  foreach ($file in $artifactFiles) {
    $relative = Get-RelativeArtifactPath $file
    Send-FtpFile $file.FullName "$stageRemotePath/$relative"
  }
  foreach ($file in $artifactFiles) {
    $relative = Get-RelativeArtifactPath $file
    $downloadPath = Join-Path $temporaryRoot ("stage-ftp\" + $relative.Replace("/", "\"))
    Receive-FtpFile "$stageRemotePath/$relative" $downloadPath
    Assert-FilesEqual $file.FullName $downloadPath "staging FTP/$relative"
  }
  Assert-PublicBuild $stagePublicUrl (Join-Path $temporaryRoot "stage-https") "$safeVersion-$timestamp"

  foreach ($relative in @("index.html", "app.js", "styles.css", "sw.js")) {
    Receive-FtpFile "$productionRemotePath/$relative" (Join-Path $temporaryRoot ("previous\" + $relative))
  }

  Move-FtpDirectory $productionRemotePath $backupRemotePath
  $productionMoved = $true
  try {
    Move-FtpDirectory $stageRemotePath $productionRemotePath
    $stageActivated = $true
  }
  catch {
    Move-FtpDirectory $backupRemotePath $productionRemotePath
    $productionMoved = $false
    throw "FTP activation failed; the previous production directory was restored."
  }

  foreach ($file in $artifactFiles) {
    $relative = Get-RelativeArtifactPath $file
    $downloadPath = Join-Path $temporaryRoot ("production-ftp\" + $relative.Replace("/", "\"))
    Receive-FtpFile "$productionRemotePath/$relative" $downloadPath
    Assert-FilesEqual $file.FullName $downloadPath "production FTP/$relative"
  }
  Assert-PublicBuild $PublicUrl (Join-Path $temporaryRoot "production-https") "$safeVersion-$timestamp"
}
catch {
  $deploymentError = $_
  if ($productionMoved -and $stageActivated) {
    try {
      Move-FtpDirectory $productionRemotePath $failedRemotePath
      Move-FtpDirectory $backupRemotePath $productionRemotePath
      $productionMoved = $false
      foreach ($relative in @("index.html", "app.js", "styles.css", "sw.js")) {
        $rollbackPath = Join-Path $temporaryRoot ("rollback\" + $relative)
        Receive-FtpFile "$productionRemotePath/$relative" $rollbackPath
        Assert-FilesEqual (Join-Path $temporaryRoot ("previous\" + $relative)) $rollbackPath "rollback/$relative"
      }
      $rollbackCompleted = $true
    }
    catch {
      throw "Production deployment failed, and automatic rollback could not be verified. Original error: $deploymentError"
    }
  }
  if ($rollbackCompleted) {
    throw "Production deployment failed; the previous directory was restored and verified. Original error: $deploymentError"
  }
  throw $deploymentError
}
finally {
  $tempParent = (Split-Path -Path $temporaryRoot -Parent).TrimEnd("\")
  if ($tempParent -ne ([IO.Path]::GetTempPath()).TrimEnd("\") -or
      (Split-Path -Path $temporaryRoot -Leaf) -notlike "bike-packing-ftp-deploy-*") {
    throw "Unsafe temporary deployment cleanup target."
  }
  if (Test-Path -LiteralPath $temporaryRoot) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
  }
}

[pscustomobject]@{
  Version = $ExpectedVersion
  PublicUrl = $PublicUrl
  UploadedFiles = $artifactFiles.Count
  FtpProductionPath = "/$productionRemotePath/"
  RemoteBackup = "/$backupRemotePath/"
  FtpSha256 = "verified"
  StageHttps = "verified"
  ProductionHttps = "verified"
} | Format-List

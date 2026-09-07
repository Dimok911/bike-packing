Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
  (Join-Path $projectRoot 'scripts/deploy-production-ftp.ps1'), [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw "Deployment script has syntax errors: $parseErrors" }
# Load only function definitions; no configuration, credentials or network access.
foreach ($definition in $ast.FindAll({ param($node)
  $node -is [System.Management.Automation.Language.FunctionDefinitionAst]
}, $false)) {
  . ([scriptblock]::Create($definition.Extent.Text))
}
function Assert-True($value, $message) { if (-not $value) { throw $message } }
$ftpPinnedPublicKey = 'sha256//fixture='
$ftpCanonicalHost = 'vniipo-help.ru'
$ftpFallbackIp = '88.212.206.188'
$ftpPort = 21
$ftpAccountRootUrl = 'ftp://vniipo-help.ru:21/'
$credential = 'fixture:user"with\quotes'
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('bike-packing-batch-test-' + [guid]::NewGuid())
$ArtifactRoot = Join-Path $fixtureRoot 'artifact'
New-Item -ItemType Directory -Path $ArtifactRoot -Force | Out-Null
$script:calls = [System.Collections.Generic.List[object]]::new()
$script:mockFailure = $false
$script:mockCorruption = $false
function Invoke-CurlConfig {
  param([string[]]$Lines)
  $script:calls.Add($Lines)
  if ($script:mockFailure) { return 7 }
  foreach ($line in $Lines) {
    if ($line -match '^output = "(.+)"$') {
      $destination = $Matches[1].Replace('\\', '\')
      Copy-Item -LiteralPath (Join-Path $ArtifactRoot (Split-Path $destination -Leaf)) -Destination $destination
      if ($script:mockCorruption) { Add-Content -LiteralPath $destination -Value 'corrupted' }
    }
  }
  return 0
}
try {
  foreach ($i in 1..65) {
    Set-Content -LiteralPath (Join-Path $ArtifactRoot ("photo-$i.txt")) -Value "fixture-$i"
  }
  $unicodeName = ([string][char]0x0444) + ' [1].txt'
  Set-Content -LiteralPath (Join-Path $ArtifactRoot $unicodeName) -Value 'unicode fixture'
  $artifactFiles = @(Get-ChildItem -LiteralPath $ArtifactRoot -File)
  Transfer-FtpArtifact -RemoteRoot 'www/vniipo-help.ru/stage'
  Assert-True ($script:calls.Count -eq 2) 'Expected 64-file batch and remainder'
  $transferCount = 0
  foreach ($call in $script:calls) {
    Assert-True ($call[0] -eq 'fail-early') 'Any failed file must fail the batch'
    Assert-True ($call -contains 'parallel-max = "4"') 'Concurrency must be bounded'
    foreach ($block in (($call -join "`n") -split "`nnext`n")) {
      foreach ($required in @(Get-FtpsSecurityLines) + @((Curl-Line 'user' $credential), 'retry-all-errors', 'retry = "4"', 'globoff')) {
        Assert-True ($block.Split("`n") -contains $required) "Missing per-file option: $required"
      }
      Assert-True ($block -match '(?m)^upload-file = ') 'Upload path missing'
      Assert-True ($block -notmatch '(?m)^quote = ') 'Renames must never be batched'
      $transferCount += 1
    }
  }
  Assert-True ($transferCount -eq 66) 'Every artifact must be transferred'
  Assert-True (($script:calls[0] -join "`n") + ($script:calls[1] -join "`n") -match '%D1%84%20%5B1%5D.txt') 'Unicode and metacharacters must be encoded'
  Transfer-FtpArtifact -RemoteRoot 'www/vniipo-help.ru/stage' -DownloadRoot (Join-Path $fixtureRoot 'download')
  $script:mockCorruption = $true
  $failed = $false
  try { Transfer-FtpArtifact -RemoteRoot 'stage' -DownloadRoot (Join-Path $fixtureRoot 'corrupt') }
  catch { $failed = $_.Exception.Message -like '*SHA-256 mismatch*' }
  Assert-True $failed 'Corrupt download must stop verification'
  $script:mockFailure = $true
  $countBefore = $script:calls.Count
  $failed = $false
  try { Transfer-FtpArtifact -RemoteRoot 'stage' }
  catch { $failed = $_.Exception.Message -like '*transfer failed*' }
  Assert-True $failed 'Transfer failure must stop deployment'
  Assert-True ($script:calls.Count -eq ($countBefore + 1)) 'Must not start next batch after failure'
  Write-Host 'Batch transport checks passed.'
} finally {
  $resolved = (Resolve-Path -LiteralPath $fixtureRoot).Path
  Assert-True ((Split-Path $resolved -Parent).TrimEnd('\', '/') -eq ([IO.Path]::GetTempPath()).TrimEnd('\', '/')) 'Unsafe fixture cleanup parent'
  Assert-True ((Split-Path $resolved -Leaf) -like 'bike-packing-batch-test-*') 'Unsafe fixture cleanup name'
  Remove-Item -LiteralPath $resolved -Recurse -Force
}

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$tokens=$null; $errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $projectRoot 'scripts/deploy-production-ftp.ps1'),[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw 'Deployment script parse failed' }
$incremental=$ast.Find({param($node) $node -is [Management.Automation.Language.IfStatementAst] -and $node.Extent.Text.StartsWith('if ($IncrementalManifest)')},$true)
if (-not $incremental) { throw 'Incremental branch missing' }
$block=[scriptblock]::Create($incremental.Extent.Text)
$testRoot=Join-Path $projectRoot ('test-results/incremental-ftps-' + [guid]::NewGuid())
$ArtifactRoot=Join-Path $testRoot 'artifact'
$temporaryRoot=Join-Path $testRoot 'evidence'
$remote=Join-Path $testRoot 'remote'
$productionRemotePath='production'; $stageRemotePath='stage'; $backupRemotePath='backup'; $failedRemotePath='failed'
$ExpectedVersion='v1612'; $PublicUrl='https://example.test/'; $stagePublicUrl='https://stage.test/'
$safeVersion='v1612';$timestamp='test';$credential='test';$ftpAccountRootUrl='test'
$IncrementalManifest=Join-Path $testRoot 'plan.json'
$paths=@('app.js','styles.css','release-contract.json','index.html','sw.js')
function Save([string]$path,[string]$text) { New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null; [IO.File]::WriteAllText($path,$text) }
function Assert-ProductionApiContract { @{Version='test';CapabilityCount=1} }
function Curl-Line { '' }
function Invoke-CurlConfig { param([switch]$Ftps,$Lines) New-Item -ItemType Directory -Force (Join-Path $remote 'backup'),(Join-Path $remote 'failed') | Out-Null; return 0 }
function Send-FtpFile($source,$target) { Save (Join-Path $remote $target) ([IO.File]::ReadAllText($source)); $script:sent++ }
function Receive-FtpFile($source,$target) { Save $target ([IO.File]::ReadAllText((Join-Path $remote $source))) }
function Move-FtpDirectory($source,$target) { Move-Item -LiteralPath (Join-Path $remote $source) -Destination (Join-Path $remote $target) }
function Assert-FilesEqual($left,$right,$label) { if ((Get-FileHash $left).Hash -ne (Get-FileHash $right).Hash) { throw "Mismatch: $label" } }
function Assert-PublicBuild { }
function Receive-HttpsFile($url,$target) {
  if ($script:failVerify) { $script:failVerify=$false; throw 'simulated public verification failure' }
  $relative=([uri]$url).AbsolutePath.TrimStart('/')
  Receive-FtpFile "production/$relative" $target
}
foreach($case in @('success','rollback')) {
  $script:sent=0; $script:failVerify=($case -eq 'rollback')
  $remote=Join-Path $testRoot $case
  $plan=@()
  foreach($path in $paths) {
    Save (Join-Path $ArtifactRoot $path) "new:$path"
    Save (Join-Path $remote "production/$path") "old:$path"
    $plan+=@{path=$path;changed=$true;deployedHash=(Get-FileHash (Join-Path $remote "production/$path")).Hash;releaseHash=(Get-FileHash (Join-Path $ArtifactRoot $path)).Hash}
  }
  Save (Join-Path $remote 'production/photos/keep.jpg') 'existing photo'
  Save (Join-Path $remote 'production/manifest.webmanifest') 'unchanged support file'
  $plan | ConvertTo-Json | Set-Content -LiteralPath $IncrementalManifest
  $failed=$false
  try { & $block | Out-Null } catch { if($case -eq 'success'){throw}; $failed=$true }
  if($failed -ne ($case -eq 'rollback')) { throw "Unexpected outcome: $case" }
  foreach($path in $paths) {
    $expected=if($case -eq 'success'){"new:$path"}else{"old:$path"}
    if([IO.File]::ReadAllText((Join-Path $remote "production/$path")) -ne $expected){throw "Bad $case content: $path"}
  }
  if($script:sent -ne 5){throw 'Unchanged files were transferred'}
  if([IO.File]::ReadAllText((Join-Path $remote 'production/photos/keep.jpg')) -ne 'existing photo'){throw 'Photo changed'}
  if([IO.File]::ReadAllText((Join-Path $remote 'production/manifest.webmanifest')) -ne 'unchanged support file'){throw 'Support file changed'}
  Write-Output "PASS: $case; five files only; existing photographs preserved"
}
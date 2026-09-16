param(
  [string]$NodeExecutable = (Get-Command node -ErrorAction Stop).Source
)
$ErrorActionPreference = 'Stop'
$nodeRuntime = (Resolve-Path -LiteralPath $NodeExecutable).Path
$frontendRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$workspaceRoot = (Resolve-Path -LiteralPath (Join-Path $frontendRoot '../../..')).Path
$expectedFrontend = [IO.Path]::GetFullPath((Join-Path $workspaceRoot 'node_modules/.cache/protocol-core-v1622'))
if (-not $frontendRoot.Equals($expectedFrontend, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Run this wrapper from the protocol-core-v1622 candidate directory.'
}
$apiRoot = (Resolve-Path -LiteralPath (Join-Path $workspaceRoot 'node_modules/.cache/protocol-core-api-v1622')).Path
$cacheRoot = (Resolve-Path -LiteralPath (Join-Path $workspaceRoot 'node_modules/.cache/mysql-causal-test')).Path
$mysqlRoot = (Resolve-Path -LiteralPath (Join-Path $cacheRoot 'mysql-8.4.11-winx64')).Path
if (-not $mysqlRoot.StartsWith($cacheRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The portable MySQL runtime must remain inside the workspace test cache.'
}
$mysqlExecutable = Join-Path $mysqlRoot 'bin/mysqld.exe'
if (-not (Test-Path -LiteralPath $mysqlExecutable -PathType Leaf)) { throw 'Portable MySQL runtime is missing.' }
$nodeHelp = (& $nodeRuntime --help) -join "`n"
if ($LASTEXITCODE -ne 0 -or $nodeHelp -notmatch '--test-skip-pattern') { throw 'Node must support --test-skip-pattern.' }

# The isolated API test clone preserves the released server implementation.
# Its protocol-core scope retains real setup/cleanup and ends after the paired
# subgroup. Skip all other tests. --test-name-pattern
# cannot narrow this nested suite: matching a parent includes its descendants.
# Node also matches ancestor-qualified names, hence the optional name prefix.
$selectedTests = @(
  'real MySQL API smoke: auth, isolation, persistence, revisions, history and cascade delete',
  'list receipts: gated CRUD, four entity kinds, exact replay, rejection, ownership and cascade-safe receipt',
  'list operation faults: real commit ACK lost, inner commit then crash, terminal rollback and late dead worker',
  'paired frontend durable queue uses the real API and MySQL for seven kinds and lost-ACK recovery',
  'assembled state projection reconciles business fields and preserves receipt bytes after lost ACK',
  'compact item rename: dual format, independent edits, receipt recovery and conflicts'
)
$smokePath = Join-Path $apiRoot 'test/integration/mysql-api-smoke.test.js'
$smokeSource = [IO.File]::ReadAllText($smokePath)
foreach ($testName in $selectedTests) {
  if (-not $smokeSource.Contains('test("' + $testName + '"')) { throw "Required API test is missing: $testName" }
}
if (-not $smokeSource.Contains('if (PROTOCOL_CORE_TEST) return;')) { throw 'The API test clone lacks its protocol-core exit boundary.' }
foreach ($relative in @('src/sync/list-operation-queue.js', 'src/sync/experiment-transport.js',
  'src/sync/causal-action-journal.js', 'src/sync/personal-save-outbox.js', 'src/sync/personal-server-payload.js')) {
  if (-not (Test-Path -LiteralPath (Join-Path $frontendRoot $relative) -PathType Leaf)) {
    throw "Required candidate module is missing: $relative"
  }
}
$escapedNames = ($selectedTests | ForEach-Object { [regex]::Escape($_) }) -join '|'
# The runner filters its file wrapper before evaluating any declared tests.
# Permit this exact filename with Windows/Unix relative or absolute prefixes,
# plus the internal <root> ancestor (skip patterns also inspect ancestors).
$fileNodePattern = '(?:.*[\\/])?mysql-api-smoke\.test\.js'
$skipPattern = '^(?!(?:(?:.* )?(?:' + $escapedNames + ')|' + $fileNodePattern + '|<root>)$).+'
# Check the selection without executing tests or importing the API.
foreach ($testName in $selectedTests) {
  if ([regex]::IsMatch($testName, $skipPattern) -or [regex]::IsMatch($selectedTests[0] + ' ' + $testName, $skipPattern)) {
    throw "Selection unexpectedly skips: $testName"
  }
}
foreach ($fileNode in @('<root>', 'mysql-api-smoke.test.js', 'test/integration/mysql-api-smoke.test.js',
  'test\integration\mysql-api-smoke.test.js', $smokePath, $smokePath.Replace('\', '/'))) {
  if ([regex]::IsMatch($fileNode, $skipPattern)) { throw "Selection unexpectedly skips the file wrapper: $fileNode" }
}
if (-not [regex]::IsMatch('causal photo attach and order: gated, reverse delivery, exact lost ACK receipts and active file bytes', $skipPattern)) {
  throw 'The selection must exclude the photo matrix.'
}

$runRoot = [IO.Path]::GetFullPath((Join-Path $cacheRoot ('protocol-core-run-' + [Guid]::NewGuid().ToString('N'))))
if (-not $runRoot.StartsWith($cacheRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or
  (Test-Path -LiteralPath $runRoot)) { throw 'Expected a new disposable run directory inside the cache.' }
$mysqlData = [IO.Path]::GetFullPath((Join-Path $runRoot 'data'))
if (-not $mysqlData.StartsWith($runRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The disposable MySQL data directory must remain inside this run directory.'
}
New-Item -ItemType Directory -Path $runRoot | Out-Null
New-Item -ItemType Directory -Path $mysqlData | Out-Null
# Start-Process creates redirect files before launching MySQL. Keep every log
# outside data so --initialize-insecure receives an empty data directory.
$testLog = Join-Path $runRoot 'protocol-core-tests.tap'
$mysqlProcess = $null
$mysqlVerified = $false
$priorDirectory = Get-Location
$taskEnvironment = @{
  BIKE_PACKING_CAUSAL_TEST_SCOPE = 'protocol-core'; BIKE_PACKING_INTEGRATION_TEST = '1';
  BIKE_PACKING_TEST_DB_HOST = '127.0.0.1'; BIKE_PACKING_TEST_DB_USER = 'root';
  BIKE_PACKING_TEST_DB_PASSWORD = ''; BIKE_PACKING_TEST_DB_NAME = 'bikepacking_protocol_core_test';
  BIKE_PACKING_TEST_CANONICAL_SESSION = '0'; BIKE_PACKING_TEST_RELEASE_COHORT = '0';
  BIKE_PACKING_FRONTEND_TEST_DIR = $frontendRoot; CAUSAL_TEST_EXPECTED_DATADIR = $mysqlData;
  # The skipped photo test normally enables this bridge. The selected receipt
  # test itself verifies the disabled gate, then enables list operations.
  BIKE_PACKING_EXPERIMENT_AUTH_BRIDGE = '1'; BIKE_PACKING_LIST_OPERATIONS_ENABLED = '0';
  BIKE_PACKING_PHOTO_OPERATIONS_ENABLED = '0'; BIKE_PACKING_CAUSAL_PHOTO_PUBLICATION_ENABLED = '0'
}
$previousEnvironment = @{}
try {
  $init = Start-Process -FilePath $mysqlExecutable -WindowStyle Hidden -Wait -PassThru -ArgumentList @(
    '--no-defaults', '--initialize-insecure', "--basedir=`"$mysqlRoot`"", "--datadir=`"$mysqlData`"", '--console'
  ) -RedirectStandardOutput (Join-Path $runRoot 'initialize.stdout.log') -RedirectStandardError (Join-Path $runRoot 'initialize.stderr.log')
  if ($init.ExitCode -ne 0) { throw 'Disposable MySQL initialization failed.' }
  $portReservation = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  try { $portReservation.Start(); $mysqlPort = $portReservation.LocalEndpoint.Port }
  finally { $portReservation.Stop() }
  $taskEnvironment.BIKE_PACKING_TEST_DB_PORT = "$mysqlPort"
  foreach ($name in $taskEnvironment.Keys) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    [Environment]::SetEnvironmentVariable($name, $taskEnvironment[$name], 'Process')
  }
  $mysqlProcess = Start-Process -FilePath $mysqlExecutable -WindowStyle Hidden -PassThru -ArgumentList @(
    '--no-defaults', "--basedir=`"$mysqlRoot`"", "--datadir=`"$mysqlData`"", '--bind-address=127.0.0.1',
    "--port=$mysqlPort", '--mysqlx=0', '--skip-log-bin', '--console'
  ) -RedirectStandardOutput (Join-Path $runRoot 'stdout.log') -RedirectStandardError (Join-Path $runRoot 'stderr.log')
  Set-Location -LiteralPath $workspaceRoot
  # Verify the listener's actual data directory before the suite may create or
  # drop any test database. Never connect to a configured external DB host.
  & $nodeRuntime --input-type=module -e 'import mysql from "mysql2/promise"; import path from "node:path"; import assert from "node:assert/strict"; let connection; for (let n=0;n<100;n++) { try { connection=await mysql.createConnection({host:"127.0.0.1",port:Number(process.env.BIKE_PACKING_TEST_DB_PORT),user:"root",connectTimeout:1000}); break; } catch { await new Promise(r=>setTimeout(r,100)); } } if(!connection) throw Error("Disposable MySQL did not start"); try { const [[row]]=await connection.query("SELECT @@datadir AS location"); assert.equal(path.resolve(row.location).toLowerCase(),path.resolve(process.env.CAUSAL_TEST_EXPECTED_DATADIR).toLowerCase()); } finally { await connection.end(); }'
  if ($LASTEXITCODE -ne 0 -or $mysqlProcess.HasExited) { throw 'Disposable MySQL identity check failed.' }
  $mysqlVerified = $true
  Set-Location -LiteralPath $apiRoot
  Write-Output "Candidate: $frontendRoot"
  Write-Output "API test clone (released server code): $apiRoot"
  Write-Output 'Scope: list receipts, transaction faults, paired queue, and item rename/reconciliation/lost ACK/outbox reload.'
  Write-Output 'Common schema and real service setup run; protocol-core scope exits after the paired subgroup, before the photo/import tail.'
  & $nodeRuntime --test --test-reporter=tap "--test-skip-pattern=$skipPattern" test/integration/mysql-api-smoke.test.js | Tee-Object -FilePath $testLog
  if ($LASTEXITCODE -ne 0) { throw "Protocol core integration failed. See $testLog" }
  $testOutput = [IO.File]::ReadAllText($testLog)
  foreach ($testName in $selectedTests) {
    $passedPattern = '(?m)^\s*ok \d+ - ' + [regex]::Escape($testName) + '\r?$'
    if (-not [regex]::IsMatch($testOutput, $passedPattern)) { throw "Required test did not report an unskipped pass: $testName" }
  }
} finally {
  try {
    Set-Location -LiteralPath $workspaceRoot
    if ($mysqlVerified) {
      # The Windows monitor may outlive/reparent the launcher. SQL shutdown is
      # permitted only after proving the same exact fresh data directory again.
      & $nodeRuntime --input-type=module -e 'import mysql from "mysql2/promise"; import path from "node:path"; import assert from "node:assert/strict"; const connection=await mysql.createConnection({host:"127.0.0.1",port:Number(process.env.BIKE_PACKING_TEST_DB_PORT),user:"root",connectTimeout:2000}); try { const [[row]]=await connection.query("SELECT @@datadir AS location"); assert.equal(path.resolve(row.location).toLowerCase(),path.resolve(process.env.CAUSAL_TEST_EXPECTED_DATADIR).toLowerCase()); await connection.query("SHUTDOWN"); } finally { await connection.end(); }'
      if ($LASTEXITCODE -ne 0) { Write-Warning "Could not confirm SQL shutdown of disposable MySQL at $mysqlData" }
    }
  } finally {
    if ($mysqlProcess -and -not $mysqlProcess.HasExited) { Stop-Process -InputObject $mysqlProcess -ErrorAction Continue }
    foreach ($name in $previousEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process') }
    Set-Location -LiteralPath $priorDirectory
    Write-Output "Disposable MySQL shutdown requested; data and test log retained at $runRoot"
  }
}

param(
  [string]$MysqlBase = 'node_modules/.cache/mysql-causal-test/mysql-8.4.11-winx64',
  [string]$ApiDirectory = '../bikepacking-api-experiment',
  [ValidateSet('all', 'public', 'imports')][string]$Scope = 'all'
)
$ErrorActionPreference = 'Stop'
$frontendRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$apiRoot = (Resolve-Path -LiteralPath (Join-Path $frontendRoot $ApiDirectory)).Path
$mysqlRoot = (Resolve-Path -LiteralPath (Join-Path $frontendRoot $MysqlBase)).Path
$cacheRoot = Join-Path $frontendRoot 'node_modules/.cache/mysql-causal-test'
if (-not $mysqlRoot.StartsWith([IO.Path]::GetFullPath($cacheRoot) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Use a disposable MySQL runtime inside the project cache, never a system installation.'
}
$mysqlExecutable = Join-Path $mysqlRoot 'bin/mysqld.exe'
if (-not (Test-Path -LiteralPath $mysqlExecutable)) { throw 'Portable MySQL runtime is missing.' }
$mysqlData = Join-Path $cacheRoot ('data-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $mysqlData | Out-Null
& $mysqlExecutable --no-defaults --initialize-insecure "--basedir=$mysqlRoot" "--datadir=$mysqlData" --console
if ($LASTEXITCODE -ne 0) { throw 'Disposable MySQL initialization failed.' }
$portReservation = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$portReservation.Start()
$mysqlPort = $portReservation.LocalEndpoint.Port
$portReservation.Stop()
$mysqlProcess = $null
$mysqlVerified = $false
$priorDirectory = Get-Location
$taskEnvironment = @{
  BIKE_PACKING_CAUSAL_TEST_SCOPE = $Scope; BIKE_PACKING_INTEGRATION_TEST = '1'; BIKE_PACKING_TEST_DB_HOST = '127.0.0.1';
  BIKE_PACKING_TEST_DB_PORT = "$mysqlPort"; BIKE_PACKING_TEST_DB_USER = 'root';
  BIKE_PACKING_TEST_DB_PASSWORD = ''; BIKE_PACKING_TEST_DB_NAME = 'bikepacking_local_causal_test';
  BIKE_PACKING_FRONTEND_TEST_DIR = $frontendRoot; CAUSAL_TEST_EXPECTED_DATADIR = $mysqlData
}
$previousEnvironment = @{}
foreach ($name in $taskEnvironment.Keys) { $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
  $mysqlProcess = Start-Process -FilePath $mysqlExecutable -WindowStyle Hidden -PassThru -ArgumentList @(
    '--no-defaults', "--basedir=`"$mysqlRoot`"", "--datadir=`"$mysqlData`"", '--bind-address=127.0.0.1',
    "--port=$mysqlPort", '--mysqlx=0', '--skip-log-bin', '--console'
  ) -RedirectStandardOutput (Join-Path $mysqlData 'stdout.log') -RedirectStandardError (Join-Path $mysqlData 'stderr.log')
  foreach ($name in $taskEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $taskEnvironment[$name], 'Process') }
  Set-Location -LiteralPath $frontendRoot
  # Before creating/dropping even test databases, prove that the listener owns
  # this exact freshly created data directory, not a different local server.
  node --input-type=module -e 'import mysql from "mysql2/promise"; import path from "node:path"; import assert from "node:assert/strict"; let connection; for (let n=0;n<100;n++) { try { connection=await mysql.createConnection({host:"127.0.0.1",port:Number(process.env.BIKE_PACKING_TEST_DB_PORT),user:"root"}); break; } catch { await new Promise(r=>setTimeout(r,100)); } } if(!connection) throw Error("Disposable MySQL did not start"); try { const [[row]]=await connection.query("SELECT @@datadir AS location"); assert.equal(path.resolve(row.location).toLowerCase(),path.resolve(process.env.CAUSAL_TEST_EXPECTED_DATADIR).toLowerCase()); } finally { await connection.end(); }'
  if ($LASTEXITCODE -ne 0 -or $mysqlProcess.HasExited) { throw 'Disposable MySQL identity check failed.' }
  $mysqlVerified = $true
  Set-Location -LiteralPath $apiRoot
  npm run test:integration
  if ($LASTEXITCODE -ne 0) { throw 'Paired API/MySQL integration tests failed.' }
} finally {
  Set-Location -LiteralPath $frontendRoot
  if ($mysqlVerified) {
    # MySQL's Windows monitor may outlive/reparent the original launcher. Stop
    # the verified server over SQL, not only the Start-Process handle.
    node --input-type=module -e 'import mysql from "mysql2/promise"; import path from "node:path"; import assert from "node:assert/strict"; const connection=await mysql.createConnection({host:"127.0.0.1",port:Number(process.env.BIKE_PACKING_TEST_DB_PORT),user:"root",connectTimeout:2000}); try { const [[row]]=await connection.query("SELECT @@datadir AS location"); assert.equal(path.resolve(row.location).toLowerCase(),path.resolve(process.env.CAUSAL_TEST_EXPECTED_DATADIR).toLowerCase()); await connection.query("SHUTDOWN"); } finally { await connection.end(); }'
    if ($LASTEXITCODE -ne 0) { Write-Warning "Could not confirm SQL shutdown of disposable MySQL at $mysqlData" }
  }
  Set-Location -LiteralPath $priorDirectory
  foreach ($name in $previousEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process') }
  if ($mysqlProcess -and -not $mysqlProcess.HasExited) { Stop-Process -InputObject $mysqlProcess }
  Write-Output "Disposable MySQL shutdown requested; diagnostic data retained at $mysqlData"
}

param([switch]$Development)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 24.10+ first.' }
$nodeVersion = [Version]((& node --version).TrimStart('v'))
if ($nodeVersion -lt [Version]'24.10.0') { throw 'ParcelHub requires Node.js 24.10 or later.' }
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
$portableNpm = Join-Path $PSScriptRoot '.tools/npm/package/bin/npm-cli.js'
if (-not $npmCommand -and -not (Test-Path -LiteralPath $portableNpm)) {
    Write-Host 'npm is not installed. Downloading a workspace-local copy from the official npm registry...'
    $runtimeDirectory = Join-Path $PSScriptRoot '.tools/npm'
    New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
    $tarball = Join-Path $runtimeDirectory 'npm.tgz'
    Invoke-WebRequest 'https://registry.npmjs.org/npm/-/npm-12.2.2.tgz' -OutFile $tarball
    & tar -xzf $tarball -C $runtimeDirectory
    if ($LASTEXITCODE -ne 0) { throw 'npm extraction failed.' }
}
if (-not $npmCommand) {
    $shimDirectory = Join-Path $PSScriptRoot '.tools/bin'
    New-Item -ItemType Directory -Force -Path $shimDirectory | Out-Null
    Set-Content -LiteralPath (Join-Path $shimDirectory 'npm.cmd') -Value '@node "%~dp0..\npm\package\bin\npm-cli.js" %*'
    $env:PATH = $shimDirectory + ';' + $env:PATH
}
function Invoke-ParcelHubNpm {
    & npm.cmd @args
    if ($LASTEXITCODE -ne 0) { throw "npm failed with exit code $LASTEXITCODE" }
}
if (-not (Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
if (-not (Test-Path -LiteralPath 'node_modules')) { Invoke-ParcelHubNpm ci }
if ($Development) { Invoke-ParcelHubNpm run dev }
else {
    Invoke-ParcelHubNpm run build
    Write-Host 'Open http://127.0.0.1:3001. Press Ctrl+C to stop. Data remains in data/.'
    Invoke-ParcelHubNpm start
}

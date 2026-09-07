Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot ".next"))) { throw "La aplicación no está compilada. Ejecute npm run build una vez." }
$npm = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
if (-not $npm) {
    $defaultNpm = "C:\Program Files\nodejs\npm.cmd"
    if (Test-Path -LiteralPath $defaultNpm) { $npm = Get-Item -LiteralPath $defaultNpm }
}
if (-not $npm) { throw "No se encontró npm.cmd. Instale Node.js LTS para todos los usuarios." }
& $npm.Source run start
if ($LASTEXITCODE -ne 0) { throw "Quercus terminó con código $LASTEXITCODE" }

param(
    [Parameter(Mandatory)][string]$BackupFile,
    [switch]$Force
)

. (Join-Path $PSScriptRoot "DbTools.ps1")
$resolvedBackup = [System.IO.Path]::GetFullPath($BackupFile)
if (-not (Test-Path -LiteralPath $resolvedBackup -PathType Leaf)) { throw "No existe el backup: $resolvedBackup" }
if (-not $Force) {
    Write-Warning "La restauración reemplazará los objetos existentes en la base configurada."
    $confirmation = Read-Host "Escriba RESTAURAR para continuar"
    if ($confirmation -cne "RESTAURAR") { Write-Host "Restauración cancelada."; exit 0 }
}
$database = Get-QuercusDatabaseParts
$pgRestore = Get-PostgresTool -Name "pg_restore"
$env:PGPASSWORD = $database.Password
try {
    & $pgRestore -h $database.Host -p $database.Port -U $database.User -d $database.Database --clean --if-exists --no-owner --exit-on-error $resolvedBackup
    if ($LASTEXITCODE -ne 0) { throw "pg_restore terminó con código $LASTEXITCODE" }
    Write-Host "Base restaurada desde: $resolvedBackup"
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

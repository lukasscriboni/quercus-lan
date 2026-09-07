param([string]$Destination)

. (Join-Path $PSScriptRoot "DbTools.ps1")
$database = Get-QuercusDatabaseParts
if (-not $Destination) {
    try { $Destination = Get-QuercusEnvValue -Name "BACKUP_DIR" } catch { $Destination = "C:\BarSystem\backups" }
}
$resolvedDestination = [System.IO.Path]::GetFullPath($Destination)
if (-not (Test-Path -LiteralPath $resolvedDestination)) { New-Item -ItemType Directory -Path $resolvedDestination -Force | Out-Null }
$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$backupFile = Join-Path $resolvedDestination "bar_$stamp.backup"
$pgDump = Get-PostgresTool -Name "pg_dump"
$env:PGPASSWORD = $database.Password
try {
    & $pgDump -h $database.Host -p $database.Port -U $database.User -d $database.Database -F c -Z 6 -f $backupFile
    if ($LASTEXITCODE -ne 0) { throw "pg_dump terminó con código $LASTEXITCODE" }
    Write-Host "Backup creado: $backupFile"
} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}

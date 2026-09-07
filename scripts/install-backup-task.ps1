param([string]$At = "23:00")

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$backupScript = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "backup-db.ps1"))
$taskName = "Quercus Daily Backup"
$runAt = [DateTime]::ParseExact($At, "HH:mm", [Globalization.CultureInfo]::InvariantCulture)
$powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$action = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$backupScript`""
$trigger = New-ScheduledTaskTrigger -Daily -At $runAt
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Backup diario local de PostgreSQL para Quercus." -Force | Out-Null
Write-Host "Backup diario instalado para las $At: $taskName"

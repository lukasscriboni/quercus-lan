Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$startScript = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "start-production.ps1"))
if (-not (Test-Path -LiteralPath $startScript)) { throw "No se encontró $startScript" }
$taskName = "Quercus LAN Server"
$powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$action = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Inicia Quercus para la red local al arrancar Windows." -Force | Out-Null
Write-Host "Inicio automático instalado: $taskName"
Write-Host "Puede probarlo con: Start-ScheduledTask -TaskName '$taskName'"

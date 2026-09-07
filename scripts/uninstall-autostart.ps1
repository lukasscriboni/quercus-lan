$taskName = "Quercus LAN Server"
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Inicio automático quitado: $taskName"
} else {
    Write-Host "La tarea $taskName no estaba instalada."
}

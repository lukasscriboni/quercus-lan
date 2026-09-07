param([int]$Port = 3000)

$ruleName = "Quercus LAN TCP $Port"
if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
    Write-Host "La regla ya existe: $ruleName"
    exit 0
}
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private -RemoteAddress LocalSubnet | Out-Null
Write-Host "Puerto TCP $Port habilitado sólo para la subred local en redes Privadas."

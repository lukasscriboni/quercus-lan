Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-QuercusEnvValue {
    param([Parameter(Mandatory)][string]$Name)
    $projectRoot = Split-Path -Parent $PSScriptRoot
    $envFile = Join-Path $projectRoot ".env"
    if (-not (Test-Path -LiteralPath $envFile)) { throw "No existe $envFile. Cree .env a partir de .env.example." }
    $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } | Select-Object -First 1
    if (-not $line) { throw "Falta $Name en .env" }
    return (($line -split "=", 2)[1].Trim()).Trim('"').Trim("'")
}

function Get-PostgresTool {
    param([Parameter(Mandatory)][string]$Name)
    $available = Get-Command "$Name.exe" -ErrorAction SilentlyContinue
    if ($available) { return $available.Source }
    $postgresRoot = "C:\Program Files\PostgreSQL"
    if (Test-Path -LiteralPath $postgresRoot) {
        $versions = Get-ChildItem -LiteralPath $postgresRoot -Directory | Sort-Object Name -Descending
        foreach ($version in $versions) {
            $candidate = Join-Path $version.FullName "bin\$Name.exe"
            if (Test-Path -LiteralPath $candidate) { return $candidate }
        }
    }
    throw "No se encontró $Name.exe. Instale PostgreSQL o agregue su carpeta bin al PATH."
}

function Get-QuercusDatabaseParts {
    $databaseUrl = Get-QuercusEnvValue -Name "DATABASE_URL"
    $uri = [System.Uri]$databaseUrl
    $credentials = $uri.UserInfo -split ":", 2
    if ($credentials.Count -ne 2) { throw "DATABASE_URL no contiene usuario y contraseña." }
    return @{
        Host = $uri.Host
        Port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
        Database = $uri.AbsolutePath.TrimStart('/')
        User = [System.Uri]::UnescapeDataString($credentials[0])
        Password = [System.Uri]::UnescapeDataString($credentials[1])
    }
}

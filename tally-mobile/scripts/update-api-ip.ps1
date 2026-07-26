# Detects the machine's current LAN/hotspot IPv4 address and rewrites
# EXPO_PUBLIC_API_URL in .env.local to match. Run this whenever the phone
# can't reach the backend after a hotspot/Wi-Fi reconnect (the address
# reassigns and the old one goes stale).

$ErrorActionPreference = "Stop"

$envFile = Join-Path $PSScriptRoot "..\.env.local"
$port = 8082

$connProfile = Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -eq "Internet" } | Select-Object -First 1
if (-not $connProfile) {
    Write-Error "No network adapter with active internet connectivity found. Are you connected to Wi-Fi/hotspot?"
    exit 1
}

$ip = (Get-NetIPAddress -InterfaceAlias $connProfile.InterfaceAlias -AddressFamily IPv4 -ErrorAction Stop |
    Where-Object { $_.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1).IPAddress

if (-not $ip) {
    Write-Error "Could not determine an IPv4 address for adapter '$($connProfile.InterfaceAlias)'."
    exit 1
}

$newUrl = "http://${ip}:${port}"

if (-not (Test-Path $envFile)) {
    Write-Error ".env.local not found at $envFile"
    exit 1
}

$content = Get-Content $envFile -Raw
$updated = $content -replace 'EXPO_PUBLIC_API_URL=http://[^\r\n]+', "EXPO_PUBLIC_API_URL=$newUrl"

if ($updated -eq $content) {
    Write-Host "No EXPO_PUBLIC_API_URL line found to replace in $envFile" -ForegroundColor Yellow
} else {
    Set-Content -Path $envFile -Value $updated -NoNewline
    Write-Host "Updated EXPO_PUBLIC_API_URL -> $newUrl (adapter: $($connProfile.InterfaceAlias))" -ForegroundColor Green
    Write-Host "Restart Expo with: npx expo start --clear" -ForegroundColor Cyan
}

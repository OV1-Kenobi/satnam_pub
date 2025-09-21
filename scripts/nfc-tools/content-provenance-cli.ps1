param(
  [string]$ContentPath = "./content.txt",
  [string]$EventOut = "./provenance-event.json"
)

Write-Host "Satnam Content Provenance CLI"

if (!(Test-Path $ContentPath)) { Write-Error "File not found: $ContentPath"; exit 1 }
$content = Get-Content -Raw $ContentPath -Encoding UTF8

# Hash in PowerShell for audit parity
$bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$hash = $sha256.ComputeHash($bytes)
$hashHex = -join ($hash | ForEach-Object { $_.ToString('x2') })

$contentEvent = @{ kind = 11100; created_at = [int](Get-Date -UFormat %s); tags = @('h', $hashHex); content = $content }

$contentEvent | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $EventOut
Write-Host "Draft provenance event written: $EventOut (sign and publish in app)"


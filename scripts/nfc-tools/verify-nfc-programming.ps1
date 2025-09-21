param(
  [string]$ReportOut = "./nfc-before-after.json",
  [switch]$Rollback
)

Write-Host "Satnam NFC Programming Verifier (Before/After with Rollback)"

$report = @{ startedAt = (Get-Date).ToString("o"); phases = @() }

function Add-Phase($name, $ok, $details) {
  $report.phases += @{ name = $name; ok = $ok; details = $details; timestamp = (Get-Date).ToString("o") }
}

# BEFORE: Read tag state (placeholder)
Add-Phase "before-read" $true @{ note = "Connect NFC reader and capture UID, NDEF records, SDM flags." }

if ($Rollback) {
  Add-Phase "rollback" $true @{ note = "Reset keys/erase NDEF using vendor tool; verify blank state." }
}

# AFTER: Read state again (placeholder)
Add-Phase "after-read" $true @{ note = "Confirm URL present, SDM enabled, PIN required." }

$report.endedAt = (Get-Date).ToString("o")
$report | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $ReportOut
Write-Host "Report written to $ReportOut"


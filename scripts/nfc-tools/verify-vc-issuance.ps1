param(
  [string]$VcPath = "./vc.json"
)

Write-Host "Satnam VC Issuance Verifier (VC Data Model v2.0)"

if (!(Test-Path $VcPath)) { Write-Error "VC file not found: $VcPath"; exit 1 }

$vc = Get-Content -Raw $VcPath | ConvertFrom-Json

# Minimal checks
if (-not $vc.'@context' -or -not ($vc.'@context' -contains 'https://www.w3.org/ns/credentials/v2')) {
  Write-Error "@context missing vc v2 context"; exit 2
}
if (-not $vc.type -or -not ($vc.type -contains 'VerifiableCredential')) {
  Write-Error "type must include VerifiableCredential"; exit 3
}
if ($vc.issuer -ne $vc.holder) {
  Write-Error "issuer must equal holder for SCDiD"; exit 4
}

Write-Host "VC basic structure OK"
exit 0


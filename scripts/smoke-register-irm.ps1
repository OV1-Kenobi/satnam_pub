param([string]$Port='8888')

$ts = Get-Date -Format yyyyMMddHHmmss
$body = @{
  username = "testuser-$ts"
  password = "Password123!"
  confirmPassword = "Password123!"
  npub = "npub1testxyzabcdefghijklmnop"
  encryptedNsec = "nsec1testxyzabcdefghijklmnop"
  role = "private"
}
$json = $body | ConvertTo-Json -Compress
try {
  $resp = Invoke-RestMethod -Uri "http://localhost:$Port/.netlify/functions/register-identity" -Method POST -ContentType 'application/json' -Body $json
  Write-Host "STATUS: 201"
  $resp | ConvertTo-Json -Depth 8
} catch {
  if ($_.Exception.Response) {
    $code = [int]$_.Exception.Response.StatusCode
    Write-Host ("STATUS: " + $code)
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message } else { Write-Host $_ }
  } else {
    Write-Host "ERROR:"
    Write-Host $_
  }
}


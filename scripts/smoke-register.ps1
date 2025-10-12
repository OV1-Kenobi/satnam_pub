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
  $resp = Invoke-WebRequest -Uri "http://localhost:$Port/.netlify/functions/register-identity" -Method POST -ContentType 'application/json' -Body $json
  Write-Host ("STATUS: " + [int]$resp.StatusCode)
  Write-Host "BODY:"
  Write-Host $resp.Content
} catch {
  if ($_.Exception.Response) {
    $code = [int]$_.Exception.Response.StatusCode
    $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
    $text = $sr.ReadToEnd()
    Write-Host ("STATUS: " + $code)
    Write-Host "BODY:"
    Write-Host $text
  } else {
    Write-Host "ERROR:"
    Write-Host $_
  }
}


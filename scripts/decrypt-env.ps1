# =============================================================================
# Decrypt Netlify env backup produced by backup-snapshot.ps1
# Usage: .\scripts\decrypt-env.ps1 -EncryptedFile "backups\20260305-013047\netlify-env-encrypted.bin"
# =============================================================================
param(
    [Parameter(Mandatory)]
    [string]$EncryptedFile,
    [string]$OutputFile = ""
)

$pass = Read-Host -Prompt "Passphrase" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pass)
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)

$payload   = [IO.File]::ReadAllBytes($EncryptedFile)
$saltBytes = $payload[0..15]
$ivBytes   = $payload[16..31]
$ctBytes   = $payload[32..($payload.Length - 1)]

$aesKey = [Security.Cryptography.Rfc2898DeriveBytes]::new($plain, $saltBytes, 100000, "SHA256").GetBytes(32)
$aes    = [Security.Cryptography.Aes]::Create()
$aes.Key = $aesKey
$aes.IV  = $ivBytes

$dec     = $aes.CreateDecryptor()
$ptBytes = $dec.TransformFinalBlock($ctBytes, 0, $ctBytes.Length)
$text    = [Text.Encoding]::UTF8.GetString($ptBytes)

if ($OutputFile) {
    $text | Out-File $OutputFile -Encoding UTF8
    Write-Host "Decrypted to: $OutputFile" -ForegroundColor Green
} else {
    Write-Host "`n── DECRYPTED ENV VARIABLES ──────────────────────────`n"
    Write-Host $text
    Write-Host "`n─────────────────────────────────────────────────────"
    Write-Host "Tip: pipe to file with -OutputFile netlify-env-restored.txt" -ForegroundColor DarkGray
}


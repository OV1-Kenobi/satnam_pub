# Simple Secret Scanner for Git Repository
# Usage: .\scripts\scan-secrets.ps1

Write-Host "Scanning for potential secrets..." -ForegroundColor Cyan

$patterns = @(
    'password\s*=\s*[^\s]{8,}',
    'secret\s*=\s*[^\s]{16,}',
    'key\s*=\s*[^\s]{16,}',
    'token\s*=\s*[^\s]{16,}',
    'api_key\s*=\s*[^\s]{16,}',
    'database_url\s*=\s*postgresql://[^\s]+',
    'supabase.*key\s*=\s*[^\s]{32,}',
    'jwt_secret\s*=\s*[^\s]{16,}',
    'private_key\s*=\s*[^\s]{32,}',
    '[a-f0-9]{64}',
    'sk_[a-zA-Z0-9]{24,}',
    'pk_[a-zA-Z0-9]{24,}'
)

$suspiciousFiles = @()
$gitTrackedFiles = git ls-files

foreach ($file in $gitTrackedFiles) {
    if (Test-Path $file -PathType Leaf) {
        $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
        if ($content) {
            foreach ($pattern in $patterns) {
                if ($content -match $pattern) {
                    $suspiciousFiles += $file
                    Write-Host "WARNING: Potential secret found in: $file" -ForegroundColor Yellow
                    break
                }
            }
        }
    }
}

if ($suspiciousFiles.Count -eq 0) {
    Write-Host "OK - No obvious secrets detected in tracked files!" -ForegroundColor Green
}
else {
    Write-Host "`nERROR - Found $($suspiciousFiles.Count) files with potential secrets:" -ForegroundColor Red
    foreach ($file in $suspiciousFiles) {
        Write-Host "   - $file" -ForegroundColor Red
    }
    Write-Host "`nPlease review these files before committing!" -ForegroundColor Yellow
    exit 1
}

Write-Host "`nOK - Repository appears safe to push!" -ForegroundColor Green
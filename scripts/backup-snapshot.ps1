# =============================================================================
# Satnam.pub Pre-Automation Backup Snapshot Script
# Usage:  .\scripts\backup-snapshot.ps1 [-Label "my-label"] [-SkipNetlify] [-SkipEnvEncrypt]
# =============================================================================
param(
    [string]$Label        = "before-automation",
    [switch]$SkipNetlify,
    [switch]$SkipEnvEncrypt
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── 1. Timestamp + paths ────────────────────────────────────────────────────
$ts        = Get-Date -Format "yyyyMMdd-HHmmss"
$tagName   = "backup-${Label}-${ts}"
$backupDir = Join-Path $PSScriptRoot "..\backups\$ts"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host " Satnam.pub Backup Snapshot  —  $ts" -ForegroundColor Cyan
Write-Host "======================================================`n"

# ── 2. Git snapshot ─────────────────────────────────────────────────────────
Write-Host "[1/4] Creating git snapshot tag: $tagName" -ForegroundColor Yellow

git add -A
$stagedCount = (git diff --cached --name-only | Measure-Object -Line).Lines
Write-Host "      Staged files: $stagedCount"

if ($stagedCount -gt 0) {
    git commit -m "WIP: $tagName [local snapshot — DO NOT PUSH]"
    $snapSha = git rev-parse HEAD
    git tag -a $tagName -m "Snapshot: $tagName  SHA: $snapSha  Files: $stagedCount"
    git reset HEAD^     # restore working state; tag remains on WIP commit
    Write-Host "      Tag '$tagName' anchored at $snapSha (HEAD reset to $(git rev-parse --short HEAD))" -ForegroundColor Green
} else {
    # No changes — tag the current HEAD directly
    $snapSha = git rev-parse HEAD
    git tag -a $tagName -m "Snapshot: $tagName  SHA: $snapSha  (clean working tree)"
    Write-Host "      Tag '$tagName' anchored at $snapSha (clean tree)" -ForegroundColor Green
}

# ── 3. State documentation ──────────────────────────────────────────────────
Write-Host "`n[2/4] Documenting current codebase state..." -ForegroundColor Yellow
$stateFile = Join-Path $backupDir "state-snapshot.txt"

@"
SATNAM.PUB BACKUP SNAPSHOT — $ts
Tag: $tagName
SHA: $snapSha

── GIT LOG (last 10) ───────────────────────────────────────────────────────
$(git log --oneline -10)

── UNCOMMITTED CHANGES AT SNAPSHOT TIME ────────────────────────────────────
$(git status --short)

── ACTIVE NETLIFY FUNCTIONS (functions_active/) ────────────────────────────
$(Get-ChildItem (Join-Path $PSScriptRoot "..\netlify\functions_active") -Filter "*.ts","*.js" -Recurse |
    Where-Object { $_.Name -notmatch "\.(d\.ts|test\.|spec\.|zip)$" } |
    Select-Object -ExpandProperty Name | Sort-Object | Out-String)

── netlify.toml: build command ──────────────────────────────────────────────
$(Select-String -Path (Join-Path $PSScriptRoot "..\netlify.toml") -Pattern "command\s*=")

── package.json version ─────────────────────────────────────────────────────
$(Select-String -Path (Join-Path $PSScriptRoot "..\package.json") -Pattern '"version"')

── FEATURE FLAGS (netlify.toml VITE_*) ──────────────────────────────────────
$(Select-String -Path (Join-Path $PSScriptRoot "..\netlify.toml") -Pattern "VITE_" | Select-Object -ExpandProperty Line)
"@ | Out-File $stateFile -Encoding UTF8

Write-Host "      State file: $stateFile" -ForegroundColor Green

# ── 4. Netlify env export ───────────────────────────────────────────────────
Write-Host "`n[3/4] Exporting Netlify environment variables..." -ForegroundColor Yellow

if (-not $SkipNetlify) {
    $netlifyAvailable = $null -ne (Get-Command "netlify" -ErrorAction SilentlyContinue)
    if ($netlifyAvailable) {
        $envRaw = netlify env:list --plain 2>&1
        if ($LASTEXITCODE -eq 0) {
            $envFile = Join-Path $backupDir "netlify-env-raw.txt"
            $envRaw | Out-File $envFile -Encoding UTF8
            Write-Host "      Raw env saved: $envFile" -ForegroundColor Green

            if (-not $SkipEnvEncrypt) {
                $pass = Read-Host -Prompt "      Enter passphrase to encrypt env file (or press Enter to skip)" -AsSecureString
                $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pass)
                $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
                if ($plain.Length -gt 0) {
                    $encBytes  = [Text.Encoding]::UTF8.GetBytes($envRaw -join "`n")
                    $saltBytes = [Security.Cryptography.RandomNumberGenerator]::GetBytes(16)
                    $aesKey    = [Security.Cryptography.Rfc2898DeriveBytes]::new($plain, $saltBytes, 100000, "SHA256").GetBytes(32)
                    $aes       = [Security.Cryptography.Aes]::Create()
                    $aes.Key   = $aesKey
                    $aes.GenerateIV()
                    $enc = $aes.CreateEncryptor()
                    $ct  = $enc.TransformFinalBlock($encBytes, 0, $encBytes.Length)
                    $payload = $saltBytes + $aes.IV + $ct
                    $encFile = Join-Path $backupDir "netlify-env-encrypted.bin"
                    [IO.File]::WriteAllBytes($encFile, $payload)
                    Remove-Item $envFile   # delete plaintext
                    Write-Host "      Encrypted env: $encFile  (salt+IV+ciphertext, AES-256-CBC, PBKDF2-SHA256 100k)" -ForegroundColor Green
                } else {
                    Write-Host "      Skipped encryption — plaintext env file kept." -ForegroundColor DarkYellow
                }
            }
        } else {
            Write-Host "      netlify env:list failed (not linked/logged in?) — skipping." -ForegroundColor DarkYellow
        }
    } else {
        Write-Host "      Netlify CLI not found — run: npm i -g netlify-cli  then: netlify login" -ForegroundColor DarkYellow
    }
} else {
    Write-Host "      -SkipNetlify specified — skipping env export." -ForegroundColor DarkYellow
}

# ── 5. Summary + rollback instructions ──────────────────────────────────────
Write-Host "`n[4/4] Writing rollback instructions..." -ForegroundColor Yellow
$rollbackFile = Join-Path $backupDir "ROLLBACK.txt"
@"
======================================================
 ROLLBACK PROCEDURE — Snapshot: $tagName
======================================================

STEP 1 — Discard all local changes since snapshot:
    git checkout $tagName -- .
    git checkout HEAD -- .
  OR for a hard reset (destroys all uncommitted work):
    git stash
    git checkout $tagName
    git checkout -b rollback-$ts

STEP 2 — Restore Supabase database:
  • Open Supabase Dashboard → your project → SQL Editor
  • Run the timestamped dump from: backups/$ts/supabase-schema-dump.sql  (if generated)
  • For full data restore: use pg_restore with your pg_dump backup

STEP 3 — Restore Netlify environment variables:
  • Decrypt: see decrypt instructions below
  • Re-import via: netlify env:import <file>
  • Or paste manually in Netlify Dashboard → Site settings → Environment variables

STEP 4 — Redeploy:
    netlify deploy --prod --dir=dist
  OR trigger via git push after restoration.

── DECRYPT ENV FILE ─────────────────────────────────────────────────────────
  Run: .\scripts\decrypt-env.ps1 -EncryptedFile "backups\$ts\netlify-env-encrypted.bin"
  (Script reads salt[0:16] + IV[16:32] + ciphertext[32:], derives AES-256 key via PBKDF2-SHA256 100k)

── TAG REFERENCE ────────────────────────────────────────────────────────────
  Tag name : $tagName
  SHA      : $snapSha
  Created  : $ts
  Files    : $stagedCount files captured in WIP commit

NOTE: This tag is LOCAL ONLY. Do not push it to origin unless explicitly intended.
      To list all backup tags: git tag --list "backup-*"
      To delete a tag locally: git tag -d <tagname>
"@ | Out-File $rollbackFile -Encoding UTF8

Write-Host "      Rollback guide: $rollbackFile" -ForegroundColor Green

Write-Host "`n✅  SNAPSHOT COMPLETE" -ForegroundColor Green
Write-Host "    Tag    : $tagName"
Write-Host "    SHA    : $snapSha"
Write-Host "    Files  : backups\$ts\"
Write-Host "`n    To rollback anytime:  git checkout $tagName -- ."
Write-Host "    To list snapshots:     git tag --list 'backup-*'`n"


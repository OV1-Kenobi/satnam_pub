#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Run TypeScript 'any' type fixes following DEVELOPMENT_PROTOCOLS.md

.DESCRIPTION
    This script runs the TypeScript any type fixer to identify and fix
    the 300+ 'any' type issues in the codebase according to the protocols.

.PARAMETER AutoFix
    Apply automated fixes to the codebase

.PARAMETER ProjectPath
    Path to the project root (defaults to current directory)

.EXAMPLE
    .\run-typescript-fixes.ps1
    
.EXAMPLE
    .\run-typescript-fixes.ps1 -AutoFix -ProjectPath "C:\path\to\project"
#>

param(
    [switch]$AutoFix,
    [string]$ProjectPath = $PWD
)

# Colors for output
$Red = "`e[31m"
$Green = "`e[32m"
$Yellow = "`e[33m"
$Blue = "`e[34m"
$Reset = "`e[0m"

Write-Host "${Blue}🔍 TypeScript 'any' Type Fixer${Reset}" -ForegroundColor Blue
Write-Host "Following DEVELOPMENT_PROTOCOLS.md standards" -ForegroundColor Gray
Write-Host ""

# Verify Node.js and TypeScript are available
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js version: $nodeVersion" -ForegroundColor Green
}
catch {
    Write-Host "${Red}❌ Node.js not found. Please install Node.js${Reset}" -ForegroundColor Red
    exit 1
}

try {
    $tscVersion = npx tsc --version
    Write-Host "✅ TypeScript version: $tscVersion" -ForegroundColor Green
}
catch {
    Write-Host "${Red}❌ TypeScript not found. Installing...${Reset}" -ForegroundColor Red
    npm install -g typescript
}

Write-Host ""

# Check if the fixer script exists
$fixerScript = Join-Path $ProjectPath "scripts" "fix-typescript-any-types.ts"
if (!(Test-Path $fixerScript)) {
    Write-Host "${Red}❌ TypeScript fixer script not found at: $fixerScript${Reset}" -ForegroundColor Red
    exit 1
}

# Compile the TypeScript fixer if needed
$fixerJs = $fixerScript -replace "\.ts$", ".js"
if (!(Test-Path $fixerJs) -or (Get-Item $fixerScript).LastWriteTime -gt (Get-Item $fixerJs).LastWriteTime) {
    Write-Host "${Yellow}🔨 Compiling TypeScript fixer script...${Reset}" -ForegroundColor Yellow
    
    try {
        npx tsc $fixerScript --target ES2020 --module commonjs --outDir (Split-Path $fixerJs)
        Write-Host "✅ Compilation successful" -ForegroundColor Green
    }
    catch {
        Write-Host "${Red}❌ Failed to compile fixer script${Reset}" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        exit 1
    }
}

Write-Host ""

# Run the fixer
Write-Host "${Blue}🚀 Running TypeScript 'any' type analysis...${Reset}" -ForegroundColor Blue
Write-Host "Project path: $ProjectPath" -ForegroundColor Gray

$fixerArgs = @($fixerJs, "--project-root", $ProjectPath)
if ($AutoFix) {
    $fixerArgs += "--auto-fix"
    Write-Host "${Yellow}⚠️  Auto-fix mode enabled - files will be modified${Reset}" -ForegroundColor Yellow
}

Write-Host ""

try {
    # Run the fixer script
    $result = node @fixerArgs
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "${Green}✅ TypeScript 'any' type analysis completed successfully!${Reset}" -ForegroundColor Green
        
        if ($AutoFix) {
            Write-Host ""
            Write-Host "${Green}🎉 Automated fixes have been applied to your codebase${Reset}" -ForegroundColor Green
            Write-Host "Please review the changes and run your tests to ensure everything works correctly." -ForegroundColor Gray
            
            # Suggest running TypeScript compiler to verify fixes
            Write-Host ""
            Write-Host "${Blue}💡 Recommended next steps:${Reset}" -ForegroundColor Blue
            Write-Host "1. Run 'npx tsc --noEmit' to check for TypeScript errors" -ForegroundColor Gray
            Write-Host "2. Run your test suite to ensure functionality is preserved" -ForegroundColor Gray
            Write-Host "3. Review and commit the changes" -ForegroundColor Gray
        }
        else {
            Write-Host ""
            Write-Host "${Yellow}💡 To apply automated fixes, run with -AutoFix parameter${Reset}" -ForegroundColor Yellow
            Write-Host "Example: .\run-typescript-fixes.ps1 -AutoFix" -ForegroundColor Gray
        }
    }
    else {
        Write-Host "${Red}❌ TypeScript 'any' type issues found${Reset}" -ForegroundColor Red
        Write-Host ""
        Write-Host "Issues need to be resolved to meet DEVELOPMENT_PROTOCOLS.md standards." -ForegroundColor Gray
        
        if (!$AutoFix) {
            Write-Host ""
            Write-Host "${Yellow}💡 Run with -AutoFix to apply automated fixes:${Reset}" -ForegroundColor Yellow
            Write-Host ".\run-typescript-fixes.ps1 -AutoFix" -ForegroundColor Gray
        }
        
        exit 1
    }
}
catch {
    Write-Host "${Red}❌ Error running TypeScript fixer:${Reset}" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""

# Optional: Run TypeScript compiler check if auto-fix was applied
if ($AutoFix) {
    Write-Host "${Blue}🔍 Running TypeScript compiler check...${Reset}" -ForegroundColor Blue
    
    try {
        $tscOutput = npx tsc --noEmit --project $ProjectPath 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "${Green}✅ TypeScript compilation check passed!${Reset}" -ForegroundColor Green
        }
        else {
            Write-Host "${Yellow}⚠️  TypeScript compilation issues detected:${Reset}" -ForegroundColor Yellow
            Write-Host $tscOutput -ForegroundColor Gray
            Write-Host ""
            Write-Host "Some fixes may need manual review. Check the output above for details." -ForegroundColor Gray
        }
    }
    catch {
        Write-Host "${Yellow}⚠️  Could not run TypeScript compiler check${Reset}" -ForegroundColor Yellow
        Write-Host "Please manually run 'npx tsc --noEmit' to verify the fixes." -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "${Green}🎯 TypeScript 'any' type fixing process completed!${Reset}" -ForegroundColor Green
Write-Host "Remember: Zero tolerance for 'any' types in production code per DEVELOPMENT_PROTOCOLS.md" -ForegroundColor Gray
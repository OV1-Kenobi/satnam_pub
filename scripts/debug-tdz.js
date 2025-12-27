#!/usr/bin/env node
/**
 * TDZ (Temporal Dead Zone) Error Detection Script
 * 
 * Analyzes TypeScript/JavaScript files for patterns that can cause TDZ errors
 * in production builds when Vite's code splitting changes module initialization order.
 * 
 * Usage: node scripts/debug-tdz.js [--verbose]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// TDZ-prone patterns to detect
const TDZ_PATTERNS = [
  {
    name: 'Module-level getEnvVar() call',
    pattern: /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*getEnvVar\s*\(/gm,
    severity: 'critical',
    fix: 'Convert to lazy getter function: function getXxx() { return getEnvVar("..."); }'
  },
  {
    name: 'Module-level import.meta.env access',
    pattern: /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*import\.meta\.env\./gm,
    severity: 'critical',
    fix: 'Use getEnvVar() helper inside a function, not at module level'
  },
  {
    name: 'Destructured createContext from React',
    pattern: /import\s*\{[^}]*createContext[^}]*\}\s*from\s*['"]react['"]/gm,
    severity: 'warning',
    fix: 'Use React.createContext() instead of destructured createContext'
  },
  {
    name: 'Module-level React context creation with destructured import',
    pattern: /^(?:export\s+)?(?:const|let)\s+\w+Context\s*=\s*createContext\s*[<(]/gm,
    severity: 'critical',
    fix: 'Use React.createContext() with full React namespace'
  },
  {
    name: 'Module-level process.env access',
    pattern: /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*process\.env\[/gm,
    severity: 'warning',
    fix: 'Access environment variables inside functions to ensure process.env is defined'
  },
  {
    name: 'Module-level class instantiation',
    pattern: /^(?:export\s+)?(?:const|let)\s+\w+\s*=\s*new\s+\w+\(/gm,
    severity: 'info',
    fix: 'Consider lazy instantiation to avoid TDZ if class imports circular dependencies'
  }
];

// File patterns to scan
const SCAN_PATTERNS = ['**/*.ts', '**/*.tsx'];
const IGNORE_PATTERNS = ['node_modules', 'dist', '.git', 'scripts/debug-tdz.js'];

function getAllFiles(dir, extensions = ['.ts', '.tsx']) {
  const files = [];
  
  function walkDir(currentDir) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(rootDir, fullPath);
        
        // Skip ignored directories
        if (IGNORE_PATTERNS.some(p => relativePath.includes(p))) continue;
        
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    } catch (e) {
      // Skip directories we can't read
    }
  }
  
  walkDir(dir);
  return files;
}

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const issues = [];
  
  for (const pattern of TDZ_PATTERNS) {
    pattern.pattern.lastIndex = 0; // Reset regex state
    let match;
    
    while ((match = pattern.pattern.exec(content)) !== null) {
      // Find line number
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;
      
      issues.push({
        file: path.relative(rootDir, filePath),
        line: lineNumber,
        column: match.index - beforeMatch.lastIndexOf('\n'),
        match: match[0].trim(),
        pattern: pattern.name,
        severity: pattern.severity,
        fix: pattern.fix
      });
    }
  }
  
  return issues;
}

function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  
  console.log('🔍 TDZ Error Detection Script');
  console.log('='.repeat(50));
  console.log('Scanning for patterns that may cause Temporal Dead Zone errors...\n');
  
  const srcDir = path.join(rootDir, 'src');
  const files = getAllFiles(srcDir);
  
  console.log(`Found ${files.length} TypeScript/TSX files to analyze\n`);
  
  let allIssues = [];
  
  for (const file of files) {
    const issues = analyzeFile(file);
    if (issues.length > 0) {
      allIssues = allIssues.concat(issues);
    }
  }
  
  // Group by severity
  const critical = allIssues.filter(i => i.severity === 'critical');
  const warnings = allIssues.filter(i => i.severity === 'warning');
  const info = allIssues.filter(i => i.severity === 'info');
  
  if (critical.length > 0) {
    console.log('🚨 CRITICAL ISSUES (likely to cause TDZ errors):');
    console.log('-'.repeat(50));
    for (const issue of critical) {
      console.log(`  ${issue.file}:${issue.line}`);
      console.log(`    Pattern: ${issue.pattern}`);
      console.log(`    Code: ${issue.match}`);
      console.log(`    Fix: ${issue.fix}\n`);
    }
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS (may cause TDZ in some configurations):');
    console.log('-'.repeat(50));
    for (const issue of warnings) {
      console.log(`  ${issue.file}:${issue.line}`);
      console.log(`    Pattern: ${issue.pattern}`);
      if (verbose) console.log(`    Code: ${issue.match}`);
      console.log(`    Fix: ${issue.fix}\n`);
    }
  }
  
  if (verbose && info.length > 0) {
    console.log('\nℹ️  INFO (review for potential issues):');
    console.log('-'.repeat(50));
    for (const issue of info) {
      console.log(`  ${issue.file}:${issue.line} - ${issue.pattern}`);
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50));
  console.log(`Critical: ${critical.length}`);
  console.log(`Warnings: ${warnings.length}`);
  console.log(`Info: ${info.length}`);
  console.log(`Total: ${allIssues.length}`);
  
  if (critical.length > 0) {
    console.log('\n❌ Critical issues found! These MUST be fixed to prevent production white screens.');
    process.exit(1);
  } else if (warnings.length > 0) {
    console.log('\n⚠️  Warnings found. Review and fix if experiencing TDZ errors.');
    process.exit(0);
  } else {
    console.log('\n✅ No TDZ-prone patterns detected!');
    process.exit(0);
  }
}

main();


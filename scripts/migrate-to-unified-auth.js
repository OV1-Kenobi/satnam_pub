#!/usr/bin/env node

/**
 * Migration Script: Unified Authentication System
 * 
 * This script helps migrate from the deprecated usePrivacyFirstAuth hook
 * and direct userIdentitiesAuth usage to the new unified authentication system.
 */

const fs = require('fs');
const path = require('path');

// Migration patterns
const MIGRATION_PATTERNS = [
  {
    name: 'usePrivacyFirstAuth import',
    pattern: /import\s*{\s*usePrivacyFirstAuth\s*}\s*from\s*['"][^'"]*usePrivacyFirstAuth['"];?/g,
    replacement: "import { useAuth } from '../lib/auth';",
    description: 'Replace usePrivacyFirstAuth import with useAuth'
  },
  {
    name: 'usePrivacyFirstAuth hook usage',
    pattern: /const\s+(\w+)\s*=\s*usePrivacyFirstAuth\(\);?/g,
    replacement: 'const $1 = useAuth();',
    description: 'Replace usePrivacyFirstAuth() calls with useAuth()'
  },
  {
    name: 'userIdentitiesAuth import',
    pattern: /import\s*{\s*userIdentitiesAuth\s*}\s*from\s*['"][^'"]*user-identities-auth['"];?/g,
    replacement: "// Migrated to unified auth system - use useAuth() hook instead",
    description: 'Replace direct userIdentitiesAuth imports'
  },
  {
    name: 'Direct userIdentitiesAuth calls',
    pattern: /userIdentitiesAuth\.(authenticateNIP05Password|authenticateNIP07|validateSession)\(/g,
    replacement: '// TODO: Replace with useAuth() hook method - $1(',
    description: 'Mark direct userIdentitiesAuth calls for manual migration'
  }
];

// Files to exclude from migration
const EXCLUDE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /dist/,
  /build/,
  /coverage/,
  /\.next/,
  /unified-auth-system\.ts$/,
  /AuthProvider\.tsx$/,
  /ProtectedRoute\.tsx$/,
  /route-protection\.tsx$/,
  /AuthIntegration\.tsx$/,
  /migrate-to-unified-auth\.js$/
];

/**
 * Check if file should be excluded from migration
 */
function shouldExcludeFile(filePath) {
  return EXCLUDE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Get all TypeScript/JavaScript files in directory
 */
function getSourceFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (!shouldExcludeFile(fullPath)) {
        getSourceFiles(fullPath, files);
      }
    } else if (stat.isFile()) {
      if (/\.(ts|tsx|js|jsx)$/.test(item) && !shouldExcludeFile(fullPath)) {
        files.push(fullPath);
      }
    }
  }
  
  return files;
}

/**
 * Analyze file for migration patterns
 */
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const issues = [];
  
  for (const pattern of MIGRATION_PATTERNS) {
    const matches = content.match(pattern.pattern);
    if (matches) {
      issues.push({
        pattern: pattern.name,
        description: pattern.description,
        matches: matches.length,
        lines: content.split('\n').map((line, index) => {
          if (pattern.pattern.test(line)) {
            return { number: index + 1, content: line.trim() };
          }
          return null;
        }).filter(Boolean)
      });
    }
  }
  
  return {
    filePath,
    needsMigration: issues.length > 0,
    issues
  };
}

/**
 * Apply automatic migrations to file
 */
function migrateFile(filePath, dryRun = true) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  const changes = [];
  
  for (const pattern of MIGRATION_PATTERNS) {
    const originalContent = content;
    content = content.replace(pattern.pattern, pattern.replacement);
    
    if (content !== originalContent) {
      modified = true;
      changes.push({
        pattern: pattern.name,
        description: pattern.description
      });
    }
  }
  
  if (modified && !dryRun) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
  
  return {
    filePath,
    modified,
    changes,
    newContent: content
  };
}

/**
 * Main migration function
 */
function runMigration(options = {}) {
  const {
    srcDir = './src',
    dryRun = true,
    verbose = false
  } = options;
  
  console.log('🔄 Unified Authentication System Migration');
  console.log('==========================================');
  console.log(`📁 Scanning directory: ${srcDir}`);
  console.log(`🔍 Mode: ${dryRun ? 'DRY RUN (no changes)' : 'APPLY CHANGES'}`);
  console.log('');
  
  // Get all source files
  const sourceFiles = getSourceFiles(srcDir);
  console.log(`📄 Found ${sourceFiles.length} source files`);
  console.log('');
  
  // Analyze files
  const analyses = sourceFiles.map(analyzeFile);
  const filesToMigrate = analyses.filter(a => a.needsMigration);
  
  if (filesToMigrate.length === 0) {
    console.log('✅ No files need migration - all files are already using the unified authentication system!');
    return;
  }
  
  console.log(`🎯 Files requiring migration: ${filesToMigrate.length}`);
  console.log('');
  
  // Show analysis results
  for (const analysis of filesToMigrate) {
    const relativePath = path.relative(process.cwd(), analysis.filePath);
    console.log(`📁 ${relativePath}`);
    
    for (const issue of analysis.issues) {
      console.log(`   • ${issue.description}: ${issue.matches} instances`);
      
      if (verbose) {
        for (const line of issue.lines) {
          console.log(`     Line ${line.number}: ${line.content}`);
        }
      }
    }
    console.log('');
  }
  
  // Apply migrations
  if (!dryRun) {
    console.log('🔧 Applying migrations...');
    console.log('');
    
    for (const analysis of filesToMigrate) {
      const result = migrateFile(analysis.filePath, false);
      const relativePath = path.relative(process.cwd(), result.filePath);
      
      if (result.modified) {
        console.log(`✅ Migrated: ${relativePath}`);
        for (const change of result.changes) {
          console.log(`   • ${change.description}`);
        }
      } else {
        console.log(`⚠️  No changes applied: ${relativePath}`);
      }
    }
    
    console.log('');
    console.log('🎉 Migration completed!');
  } else {
    console.log('💡 To apply these changes, run with --apply flag');
  }
  
  // Show next steps
  console.log('');
  console.log('📋 Next Steps:');
  console.log('1. Review the changes above');
  console.log('2. Update your main App component to use AuthProvider');
  console.log('3. Add route protection to sensitive areas');
  console.log('4. Test authentication flows');
  console.log('5. Remove deprecated authentication files if no longer needed');
  console.log('');
  console.log('📖 See docs/unified-authentication-system.md for detailed migration guide');
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    dryRun: !args.includes('--apply'),
    verbose: args.includes('--verbose'),
    srcDir: args.find(arg => arg.startsWith('--src='))?.split('=')[1] || './src'
  };
  
  runMigration(options);
}

module.exports = { runMigration, analyzeFile, migrateFile };

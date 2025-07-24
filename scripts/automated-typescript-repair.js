#!/usr/bin/env node

/**
 * Automated TypeScript Error Repair Script
 * Fixes common patterns in the 412 TypeScript errors identified
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 AUTOMATED TYPESCRIPT REPAIR SCRIPT STARTING...');
console.log('');

// Common import path fixes
const IMPORT_FIXES = [
  // API imports that need .js extensions
  { from: /from ['"]\.\.\/api\/([^'"]+)['"]/, to: "from '../api/$1.js'" },
  { from: /from ['"]\.\.\/\.\.\/api\/([^'"]+)['"]/, to: "from '../../api/$1.js'" },
  { from: /from ['"]\.\.\/\.\.\/\.\.\/api\/([^'"]+)['"]/, to: "from '../../../api/$1.js'" },
  
  // Lib imports that need .js extensions
  { from: /from ['"]\.\.\/lib\/([^'"]+)['"]/, to: "from '../lib/$1.js'" },
  { from: /from ['"]\.\.\/\.\.\/lib\/([^'"]+)['"]/, to: "from '../../lib/$1.js'" },
  
  // Utils imports that need .js extensions
  { from: /from ['"]\.\.\/utils\/([^'"]+)['"]/, to: "from '../utils/$1.js'" },
  { from: /from ['"]\.\.\/\.\.\/utils\/([^'"]+)['"]/, to: "from '../../utils/$1.js'" },
  
  // Specific module fixes
  { from: /from ['"]\.\.\/hybrid-auth['"]/, to: "from '../hybrid-auth.js'" },
  { from: /from ['"]\.\.\/secure-storage['"]/, to: "from '../secure-storage.js'" },
  { from: /from ['"]\.\.\/crypto\/privacy-manager['"]/, to: "from '../crypto/privacy-manager.js'" },
  { from: /from ['"]\.\.\/crypto\/event-signer['"]/, to: "from '../crypto/event-signer.js'" },
  { from: /from ['"]\.\.\/privacy['"]/, to: "from '../privacy.js'" },
  { from: /from ['"]\.\.\/redis['"]/, to: "from '../redis.js'" },
];

// Type export fixes
const TYPE_FIXES = [
  // SatnamFamilyMember -> FamilyMember
  { from: /SatnamFamilyMember/g, to: 'FamilyMember' },
  
  // CitadelDatabase import fix
  { from: /import { CitadelDatabase, supabase } from/, to: 'import CitadelDatabase, { supabase } from' },
  
  // Export type fixes for isolatedModules
  { from: /export { ([^}]+) } from/, to: 'export type { $1 } from' },
];

// Supabase import fixes
const SUPABASE_FIXES = [
  // Add supabase import where missing
  { 
    pattern: /supabase\./,
    fix: (content, filePath) => {
      if (!content.includes("import") || !content.includes("supabase")) {
        const importLine = "import { supabase } from '../lib/supabase.js';\n";
        return importLine + content;
      }
      return content;
    }
  }
];

// Environment variable fixes
const ENV_VAR_FIXES = [
  // Replace direct process.env with getEnvVar pattern
  {
    from: /process\.env\.([A-Z_]+)/g,
    to: 'getEnvVar("$1")'
  }
];

/**
 * Apply automated fixes to a file
 * @param {string} filePath - Path to the file
 * @param {string} content - File content
 * @returns {string} Fixed content
 */
function applyAutomatedFixes(filePath, content) {
  let fixedContent = content;
  let changesApplied = 0;

  // Apply import path fixes
  IMPORT_FIXES.forEach(fix => {
    const beforeLength = fixedContent.length;
    fixedContent = fixedContent.replace(fix.from, fix.to);
    if (fixedContent.length !== beforeLength) {
      changesApplied++;
    }
  });

  // Apply type fixes
  TYPE_FIXES.forEach(fix => {
    const beforeLength = fixedContent.length;
    fixedContent = fixedContent.replace(fix.from, fix.to);
    if (fixedContent.length !== beforeLength) {
      changesApplied++;
    }
  });

  // Apply environment variable fixes
  ENV_VAR_FIXES.forEach(fix => {
    const beforeLength = fixedContent.length;
    fixedContent = fixedContent.replace(fix.from, fix.to);
    if (fixedContent.length !== beforeLength) {
      changesApplied++;
    }
  });

  // Add getEnvVar function if environment variables are used
  if (fixedContent.includes('getEnvVar(') && !fixedContent.includes('function getEnvVar')) {
    const getEnvVarFunction = `
/**
 * MASTER CONTEXT COMPLIANCE: Browser-compatible environment variable handling
 * @param {string} key - Environment variable key
 * @returns {string|undefined} Environment variable value
 */
function getEnvVar(key) {
  if (typeof import.meta !== "undefined") {
    const metaWithEnv = /** @type {Object} */ (import.meta);
    if (metaWithEnv.env) {
      return metaWithEnv.env[key];
    }
  }
  return process.env[key];
}

`;
    fixedContent = getEnvVarFunction + fixedContent;
    changesApplied++;
  }

  return { content: fixedContent, changes: changesApplied };
}

/**
 * Process all TypeScript files in a directory
 * @param {string} dir - Directory to process
 * @param {Array} results - Results array
 */
function processDirectory(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory() && !['node_modules', '.git', 'dist', 'build'].includes(item)) {
      processDirectory(fullPath, results);
    } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const { content: fixedContent, changes } = applyAutomatedFixes(fullPath, content);
        
        if (changes > 0) {
          fs.writeFileSync(fullPath, fixedContent, 'utf8');
          results.push({
            file: fullPath,
            changes: changes
          });
          console.log(`✅ Fixed ${changes} issues in ${fullPath}`);
        }
      } catch (error) {
        console.error(`❌ Error processing ${fullPath}:`, error.message);
      }
    }
  }
  
  return results;
}

// Process all directories
const directories = ['src', 'lib', 'scripts', 'utils', 'types', 'netlify/functions'];
let totalChanges = 0;
let totalFiles = 0;

directories.forEach(dir => {
  console.log(`📁 Processing directory: ${dir}`);
  const results = processDirectory(dir);
  totalFiles += results.length;
  totalChanges += results.reduce((sum, r) => sum + r.changes, 0);
});

console.log('');
console.log('🎯 AUTOMATED REPAIR SUMMARY:');
console.log(`   Files processed: ${totalFiles}`);
console.log(`   Total changes applied: ${totalChanges}`);

if (totalChanges > 0) {
  console.log('');
  console.log('✅ AUTOMATED REPAIRS COMPLETED');
  console.log('🔄 Run "npx tsc --noEmit" to verify remaining errors');
} else {
  console.log('');
  console.log('ℹ️  NO AUTOMATED FIXES APPLIED');
  console.log('   Manual intervention may be required for remaining errors');
}

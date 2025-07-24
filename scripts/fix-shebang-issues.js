#!/usr/bin/env node

/**
 * Fix Shebang Issues Script
 * Moves shebang lines to the top of files where they were displaced
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 FIXING SHEBANG ISSUES...');
console.log('');

// Files that need shebang fixes based on the TypeScript errors
const filesToFix = [
  'scripts/debug-env.ts',
  'scripts/deploy-secure.ts', 
  'scripts/enable-vault.ts',
  'scripts/secure-migration-manager.ts',
  'scripts/setup-vault.ts',
  'scripts/start-dev.ts',
  'scripts/test-backend.ts',
  'scripts/test-env.ts',
  'scripts/test-rebuilding-camelot-otp.ts',
  'scripts/test-vault-credentials.ts',
  'scripts/verify-auth-privacy.ts'
];

/**
 * Fix shebang position in a file
 * @param {string} filePath - Path to the file
 */
function fixShebangPosition(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    // Find the shebang line (should start with #!)
    let shebangIndex = -1;
    let shebangLine = '';
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#!/')) {
        shebangIndex = i;
        shebangLine = lines[i];
        break;
      }
    }
    
    if (shebangIndex === -1) {
      console.log(`⚠️  No shebang found in ${filePath}`);
      return false;
    }
    
    if (shebangIndex === 0) {
      console.log(`✅ Shebang already at top in ${filePath}`);
      return false;
    }
    
    // Remove the shebang from its current position
    lines.splice(shebangIndex, 1);
    
    // Add shebang at the top
    lines.unshift(shebangLine);
    
    // Write the fixed content back
    const fixedContent = lines.join('\n');
    fs.writeFileSync(filePath, fixedContent, 'utf8');
    
    console.log(`✅ Fixed shebang position in ${filePath}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error.message);
    return false;
  }
}

// Fix all files
let fixedCount = 0;
filesToFix.forEach(file => {
  if (fixShebangPosition(file)) {
    fixedCount++;
  }
});

console.log('');
console.log(`🎯 SHEBANG FIX SUMMARY: ${fixedCount} files fixed`);

// Also fix the template string issue in verify-auth-privacy.ts
try {
  const verifyAuthPath = 'scripts/verify-auth-privacy.ts';
  const content = fs.readFileSync(verifyAuthPath, 'utf8');
  
  // Fix the template string issue
  const fixedContent = content.replace(
    /"\$\{getEnvVar\("SECRET_KEY"\)\}"/g,
    '`${getEnvVar("SECRET_KEY")}`'
  );
  
  if (content !== fixedContent) {
    fs.writeFileSync(verifyAuthPath, fixedContent, 'utf8');
    console.log(`✅ Fixed template string in ${verifyAuthPath}`);
  }
} catch (error) {
  console.error('❌ Error fixing template string:', error.message);
}

console.log('');
console.log('✅ SHEBANG FIXES COMPLETED');

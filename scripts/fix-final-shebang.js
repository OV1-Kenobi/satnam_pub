#!/usr/bin/env node

/**
 * Fix Final Shebang Issue
 * Remove blank line before shebang in check-vault.ts
 */

import fs from 'fs';

console.log('🔧 FIXING FINAL SHEBANG ISSUE...');

const filePath = 'scripts/check-vault.ts';

try {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  // Remove any blank lines at the beginning
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }
  
  // Ensure shebang is at the very beginning
  if (lines[0] && lines[0].startsWith('#!/')) {
    console.log('✅ Shebang is now at the beginning');
  } else {
    console.log('❌ Shebang not found at beginning');
  }
  
  const fixedContent = lines.join('\n');
  fs.writeFileSync(filePath, fixedContent, 'utf8');
  
  console.log('✅ Fixed shebang position in check-vault.ts');
  
} catch (error) {
  console.error('❌ Error fixing shebang:', error.message);
}

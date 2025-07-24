#!/usr/bin/env node

/**
 * Fix getEnvVar Function Type Signatures
 * Add proper TypeScript type annotations to all getEnvVar functions
 */

import fs from 'fs';
import path from 'path';

console.log('🔧 FIXING GETENVVAR FUNCTION TYPE SIGNATURES...');
console.log('');

/**
 * Fix getEnvVar function signature in a file
 * @param {string} filePath - Path to the file
 */
function fixGetEnvVarSignature(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Fix the function signature
    const fixedContent = content.replace(
      /function getEnvVar\(key\)\s*{/g,
      'function getEnvVar(key: string): string | undefined {'
    );
    
    if (content !== fixedContent) {
      fs.writeFileSync(filePath, fixedContent, 'utf8');
      console.log(`✅ Fixed getEnvVar signature in ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Error fixing ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Process all files in a directory
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
      if (fixGetEnvVarSignature(fullPath)) {
        results.push(fullPath);
      }
    }
  }
  
  return results;
}

// Process all directories
const directories = ['lib', 'scripts', 'utils', 'src', 'netlify/functions'];
let totalFiles = 0;

directories.forEach(dir => {
  console.log(`📁 Processing directory: ${dir}`);
  const results = processDirectory(dir);
  totalFiles += results.length;
});

console.log('');
console.log(`🎯 GETENVVAR TYPE FIX SUMMARY: ${totalFiles} files updated`);

// Also fix any remaining parameter type issues
const filesToFixManually = [
  'lib/api/atomic-swap.ts',
  'lib/api/federated-signing.ts',
  'utils/otp-storage.ts'
];

filesToFixManually.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      let changed = false;
      
      // Fix common parameter type issues
      const fixes = [
        { from: /\(acc, signerId\) => {/g, to: '(acc: any, signerId: string) => {' },
        { from: /\(event\) => {/g, to: '(event: any) => {' },
        { from: /\(log\) => /g, to: '(log: any) => ' },
        { from: /\(sum, log\) => {/g, to: '(sum: number, log: any) => {' },
        { from: /\(r\) => r\./g, to: '(r: any) => r.' },
        { from: /const swaps = \[\];/g, to: 'const swaps: any[] = [];' }
      ];
      
      fixes.forEach(fix => {
        const newContent = content.replace(fix.from, fix.to);
        if (newContent !== content) {
          content = newContent;
          changed = true;
        }
      });
      
      if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✅ Fixed parameter types in ${filePath}`);
      }
    } catch (error) {
      console.error(`❌ Error fixing ${filePath}:`, error.message);
    }
  }
});

console.log('');
console.log('✅ GETENVVAR TYPE FIXES COMPLETED');

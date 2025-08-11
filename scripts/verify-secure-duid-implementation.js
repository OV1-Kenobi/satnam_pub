#!/usr/bin/env node

/**
 * Verification Script for Secure DUID Architecture Implementation
 * Validates that Phase 1 & 2 implementation is complete and secure
 * 
 * Run with: node scripts/verify-secure-duid-implementation.js
 */

import fs from 'fs';

console.log('🔍 VERIFYING SECURE DUID ARCHITECTURE IMPLEMENTATION');
console.log('====================================================');

let totalIssues = 0;
let totalChecks = 0;

/**
 * Check if file exists and contains expected patterns
 */
function checkFile(filePath, checks) {
  totalChecks++;
  
  if (!fs.existsSync(filePath)) {
    console.log(`❌ Missing file: ${filePath}`);
    totalIssues++;
    return false;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  let fileIssues = 0;
  
  checks.forEach(check => {
    if (check.shouldContain) {
      check.shouldContain.forEach(pattern => {
        if (!content.includes(pattern)) {
          console.log(`❌ ${filePath}: Missing pattern "${pattern}"`);
          fileIssues++;
        }
      });
    }
    
    if (check.shouldNotContain) {
      check.shouldNotContain.forEach(pattern => {
        if (content.includes(pattern)) {
          console.log(`❌ ${filePath}: Contains deprecated pattern "${pattern}"`);
          fileIssues++;
        }
      });
    }
  });
  
  if (fileIssues === 0) {
    console.log(`✅ ${filePath}: All checks passed`);
  } else {
    totalIssues += fileIssues;
  }
  
  return fileIssues === 0;
}

/**
 * Check that deprecated files are removed
 */
function checkDeprecatedFilesRemoved() {
  console.log('\n📁 CHECKING DEPRECATED FILES REMOVED...');
  
  const deprecatedFiles = [
    'DUID_IMPLEMENTATION_SUMMARY.md',
    'test-duid-implementation.js',
    'lib/security/password-change-manager.js',
    'database/migrations/add_global_salt_for_duid.sql',
    'database/migrations/duid_migration_v2_final.sql',
    'IDENTITY_FORGE_DUID_INTEGRATION.md'
  ];
  
  deprecatedFiles.forEach(file => {
    totalChecks++;
    if (fs.existsSync(file)) {
      console.log(`❌ Deprecated file still exists: ${file}`);
      totalIssues++;
    } else {
      console.log(`✅ Deprecated file removed: ${file}`);
    }
  });
}

/**
 * Check core DUID implementation files
 */
function checkCoreImplementation() {
  console.log('\n🔐 CHECKING CORE DUID IMPLEMENTATION...');
  
  // Client-side DUID generator
  checkFile('lib/security/duid-generator.js', [{
    shouldContain: [
      'export async function generateDUID(npub)',
      'const deterministicInput = "DUIDv1" + npub',
      'crypto.subtle.digest(\'SHA-256\'',
      '// REMOVED: regenerateDUID() function'
    ],
    shouldNotContain: [
      'generateDUID(npub, password)',
      'PBKDF2',
      'global salt',
      'getGlobalSalt',
      'regenerateDUID',
      '@deprecated'
    ]
  }]);
  
  // TypeScript declarations
  checkFile('lib/security/duid-generator.d.ts', [{
    shouldContain: [
      'export function generateDUID(npub: string): Promise<string>',
      '// REMOVED: regenerateDUID() function'
    ],
    shouldNotContain: [
      'password: string',
      'globalSalt',
      'regenerateDUID',
      '@deprecated'
    ]
  }]);
  
  // Server-side DUID indexing
  checkFile('netlify/functions/security/duid-index-generator.js', [{
    shouldContain: [
      'export function generateDUIDIndex(duid_public)',
      'crypto.createHmac(\'sha256\', serverSecret)',
      'process.env.DUID_SERVER_SECRET',
      'export function generateDUIDIndexFromNpub(npub)'
    ],
    shouldNotContain: [
      'password',
      'global salt',
      'PBKDF2'
    ]
  }]);
}

/**
 * Check authentication system updates
 */
function checkAuthenticationUpdates() {
  console.log('\n🔑 CHECKING AUTHENTICATION SYSTEM UPDATES...');
  
  // Registration function
  checkFile('netlify/functions/register-identity.js', [{
    shouldContain: [
      'generateDUIDIndexFromNpub',
      'const duid_index = generateDUIDIndexFromNpub(userData.npub)',
      'id: duid_index'
    ],
    shouldNotContain: [
      'generateDUID(npub, password)',
      'userId = crypto.randomUUID()'
    ]
  }]);
  
  // Hybrid auth function
  checkFile('netlify/functions/hybrid-auth.ts', [{
    shouldContain: [
      'generateDUIDIndexFromNpub',
      '.eq("id", duid_index)'
    ],
    shouldNotContain: [
      '.eq("npub", npub)',
      'generateDUID(npub, password)'
    ]
  }]);
  
  // Identity Forge component
  checkFile('src/components/IdentityForge.tsx', [{
    shouldContain: [
      'const { generateDUID } = await import(\'../../lib/security/duid-generator\')',
      'deterministicUserId = await generateDUID(keyPair.npub)',
      'stable: true // DUID survives password changes'
    ],
    shouldNotContain: [
      'generateDUID(keyPair.npub, formData.password)',
      'password dependency'
    ]
  }]);
}

/**
 * Check database schema updates
 */
function checkDatabaseUpdates() {
  console.log('\n🗄️ CHECKING DATABASE SCHEMA UPDATES...');
  
  // Privacy-first migration
  checkFile('database/privacy-first-identity-system-migration.sql', [{
    shouldContain: [
      'DUID index for secure O(1) authentication (Phase 2)',
      'CREATE OR REPLACE VIEW current_user_identity',
      'id AS duid_index'
    ],
    shouldNotContain: [
      'hash(npub + password, GLOBAL_SALT)',
      'global salt'
    ]
  }]);
  
  // Educational system schema
  checkFile('database/educational-system-schema.sql', [{
    shouldContain: [
      'SELECT hashed_npub FROM current_user_identity'
    ],
    shouldNotContain: [
      'SELECT npub FROM profiles',
      'auth.uid()'
    ]
  }]);
}

/**
 * Check documentation updates
 */
function checkDocumentation() {
  console.log('\n📚 CHECKING DOCUMENTATION UPDATES...');
  
  // Main implementation guide
  checkFile('SECURE_DUID_ARCHITECTURE_IMPLEMENTATION.md', [{
    shouldContain: [
      'Phase 1: Frontend DUID Generation (Public Identifier)',
      'Phase 2: Backend Index Generation (Private Lookup)',
      'duid_public = SHA-256("DUIDv1" || npub)',
      'duid_index = HMAC-SHA-256(server_secret, duid_public)'
    ],
    shouldNotContain: [
      'password + global salt',
      'PBKDF2'
    ]
  }]);
  
  // Environment setup guide
  checkFile('DUID_SERVER_SECRET_SETUP.md', [{
    shouldContain: [
      'DUID_SERVER_SECRET',
      'openssl rand -hex 32',
      'HMAC-SHA-256(server_secret, duid_public)'
    ]
  }]);
  
  // Cleanup summary
  checkFile('SECURITY_AUDIT_CLEANUP_COMPLETE.md', [{
    shouldContain: [
      'SECURITY AUDIT CLEANUP COMPLETE',
      'All deprecated code cleaned up',
      'Phase 1 & 2 COMPLETE'
    ]
  }]);
}

/**
 * Check environment configuration
 */
function checkEnvironmentConfig() {
  console.log('\n🌍 CHECKING ENVIRONMENT CONFIGURATION...');
  
  // Check vault config cleanup
  checkFile('lib/vault-config.ts', [{
    shouldContain: [
      '// REMOVED: getGlobalSalt() function',
      'secure DUID architecture doesn\'t use global salt'
    ],
    shouldNotContain: [
      'getGlobalSalt',
      'DEPRECATED'
    ]
  }]);
}

/**
 * Main verification function
 */
function runVerification() {
  console.log('Starting comprehensive verification...\n');
  
  checkDeprecatedFilesRemoved();
  checkCoreImplementation();
  checkAuthenticationUpdates();
  checkDatabaseUpdates();
  checkDocumentation();
  checkEnvironmentConfig();
  
  console.log('\n' + '='.repeat(60));
  console.log(`📊 VERIFICATION SUMMARY:`);
  console.log(`   Total Checks: ${totalChecks}`);
  console.log(`   Issues Found: ${totalIssues}`);
  
  if (totalIssues === 0) {
    console.log('\n🎉 ✅ ALL CHECKS PASSED!');
    console.log('🔒 Secure DUID Architecture implementation is complete and verified.');
    console.log('🚀 Ready for production deployment with DUID_SERVER_SECRET configuration.');
    process.exit(0);
  } else {
    console.log('\n⚠️ ❌ ISSUES FOUND!');
    console.log('🔧 Please address the issues above before deployment.');
    process.exit(1);
  }
}

// Run verification
runVerification();

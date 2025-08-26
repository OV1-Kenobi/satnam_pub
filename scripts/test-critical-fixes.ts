#!/usr/bin/env tsx
/**
 * Test script for critical fixes:
 * 1. Key generation failure fix
 * 2. Username availability RLS policy fix
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

console.log('🧪 Testing Critical Fixes...\n');

// ============================================================================
// Test 1: Key Generation Fix
// ============================================================================

console.log('📋 TEST 1: Key Generation Fix');
console.log('=' .repeat(50));

async function testKeyGeneration() {
  try {
    console.log('🔑 Testing backend key generation...');
    
    // Import the fixed key generation function
    const { generateNostrKeyPair } = await import('../lib/api/register-identity.js');
    
    console.log('✅ Import successful');
    
    // Test key generation
    const keyPair = await generateNostrKeyPair();
    
    console.log('✅ Key generation successful:', {
      hasNpub: !!keyPair.npub,
      hasNsec: !!keyPair.nsec,
      hasPublicKey: !!keyPair.publicKey,
      hasPrivateKey: !!keyPair.privateKey,
      npubLength: keyPair.npub?.length,
      nsecLength: keyPair.nsec?.length
    });
    
    // Validate key formats
    if (!keyPair.npub?.startsWith('npub1')) {
      throw new Error('Invalid npub format');
    }
    
    if (!keyPair.nsec?.startsWith('nsec1')) {
      throw new Error('Invalid nsec format');
    }
    
    console.log('✅ Key format validation passed');
    return true;
    
  } catch (error) {
    console.error('❌ Key generation test failed:', error);
    console.error('❌ Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return false;
  }
}

// ============================================================================
// Test 2: Frontend Crypto Factory Fix
// ============================================================================

console.log('\n📋 TEST 2: Frontend Crypto Factory Fix');
console.log('=' .repeat(50));

async function testCryptoFactory() {
  try {
    console.log('🔑 Testing crypto factory key generation...');
    
    // Import the fixed crypto factory
    const { generateNostrKeyPair } = await import('../utils/crypto-factory.ts');
    
    console.log('✅ Crypto factory import successful');
    
    // Test key generation
    const keyPair = await generateNostrKeyPair();
    
    console.log('✅ Crypto factory key generation successful:', {
      hasNpub: !!keyPair.npub,
      hasNsec: !!keyPair.nsec,
      npubLength: keyPair.npub?.length,
      nsecLength: keyPair.nsec?.length
    });
    
    return true;
    
  } catch (error) {
    console.error('❌ Crypto factory test failed:', error);
    return false;
  }
}

// ============================================================================
// Test 3: Username Availability Function Fix
// ============================================================================

console.log('\n📋 TEST 3: Username Availability Function Fix');
console.log('=' .repeat(50));

async function testUsernameAvailability() {
  try {
    console.log('🔍 Testing username availability function import...');
    
    // Test that the function can be imported without errors
    const usernameModule = await import('../api/auth/check-username-availability.js');
    
    console.log('✅ Username availability function import successful');
    
    // Check if the Supabase client is properly configured
    console.log('🔧 Supabase client configuration should be logged above');
    
    return true;
    
  } catch (error) {
    console.error('❌ Username availability test failed:', error);
    return false;
  }
}

// ============================================================================
// Test 4: Database Migration Check
// ============================================================================

console.log('\n📋 TEST 4: Database Migration File Check');
console.log('=' .repeat(50));

function testDatabaseMigration() {
  try {
    console.log('📄 Checking database migration file...');
    
    const migrationContent = readFileSync('database/fix-rate-limits-rls-policies.sql', 'utf8');
    
    // Check for key components
    const hasServiceRolePolicy = migrationContent.includes('service_role_rate_limits_full_access');
    const hasAnonPolicy = migrationContent.includes('anon_rate_limits_operations');
    const hasGrants = migrationContent.includes('GRANT SELECT, INSERT, UPDATE ON rate_limits TO anon');
    
    console.log('✅ Migration file components:', {
      hasServiceRolePolicy,
      hasAnonPolicy,
      hasGrants,
      fileSize: migrationContent.length
    });
    
    if (!hasServiceRolePolicy || !hasAnonPolicy || !hasGrants) {
      throw new Error('Migration file missing required components');
    }
    
    console.log('✅ Database migration file validation passed');
    return true;
    
  } catch (error) {
    console.error('❌ Database migration test failed:', error);
    return false;
  }
}

// ============================================================================
// Run All Tests
// ============================================================================

async function runAllTests() {
  console.log('🚀 Running all critical fix tests...\n');
  
  const results = {
    keyGeneration: await testKeyGeneration(),
    cryptoFactory: await testCryptoFactory(),
    usernameAvailability: await testUsernameAvailability(),
    databaseMigration: testDatabaseMigration()
  };
  
  console.log('\n📊 TEST RESULTS SUMMARY');
  console.log('=' .repeat(50));
  
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅ PASSED' : '❌ FAILED';
    console.log(`${test.padEnd(20)}: ${status}`);
  });
  
  const allPassed = Object.values(results).every(result => result);
  
  console.log('\n🎯 OVERALL RESULT:', allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
  
  if (allPassed) {
    console.log('\n🎉 Critical fixes are ready for deployment!');
    console.log('\n📝 Next steps:');
    console.log('1. Run the database migration: database/fix-rate-limits-rls-policies.sql');
    console.log('2. Deploy the updated functions');
    console.log('3. Test the registration flow end-to-end');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.');
  }
  
  return allPassed;
}

// Run the tests
runAllTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});

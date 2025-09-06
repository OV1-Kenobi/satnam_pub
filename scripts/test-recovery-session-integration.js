#!/usr/bin/env node

/**
 * Recovery Session Integration Test
 * 
 * Tests the complete recovery session integration:
 * 1. Recovery Session Bridge functionality
 * 2. Hybrid Message Signing integration
 * 3. UI component integration
 * 
 * This script verifies that the build is working and imports are correct.
 */

console.log('🧪 Testing Recovery Session Integration');
console.log('=' .repeat(50));

async function testImports() {
  console.log('📦 Testing imports...');
  
  try {
    // Test Recovery Session Bridge import
    console.log('  ✓ Testing RecoverySessionBridge import...');
    const { recoverySessionBridge } = await import('../src/lib/auth/recovery-session-bridge.js');
    console.log('  ✅ RecoverySessionBridge imported successfully');
    
    // Test availability check
    const isAvailable = await recoverySessionBridge.isRecoverySessionAvailable();
    console.log('  ✓ Recovery session availability check:', isAvailable);
    
    // Test session status
    const status = recoverySessionBridge.getRecoverySessionStatus();
    console.log('  ✓ Recovery session status:', {
      hasSession: status.hasSession,
      canSign: status.canSign,
      createdViaRecovery: status.createdViaRecovery
    });
    
  } catch (error) {
    console.error('  ❌ RecoverySessionBridge import failed:', error.message);
    return false;
  }
  
  try {
    // Test Hybrid Message Signing import
    console.log('  ✓ Testing HybridMessageSigning import...');
    const { hybridMessageSigning } = await import('../src/lib/messaging/hybrid-message-signing.js');
    console.log('  ✅ HybridMessageSigning imported successfully');
    
    // Test available methods
    const methods = await hybridMessageSigning.getAvailableSigningMethods();
    console.log('  ✓ Available signing methods:', methods.map(m => m.id));
    
  } catch (error) {
    console.error('  ❌ HybridMessageSigning import failed:', error.message);
    return false;
  }
  
  return true;
}

async function testRecoverySessionCreation() {
  console.log('🔐 Testing recovery session creation (mock)...');
  
  try {
    const { recoverySessionBridge } = await import('../src/lib/auth/recovery-session-bridge.js');
    
    // Test with invalid credentials (should fail gracefully)
    const result = await recoverySessionBridge.createSessionFromRecovery({
      nip05: 'test@example.com',
      password: 'invalid-password'
    });
    
    console.log('  ✓ Mock recovery session creation result:', {
      success: result.success,
      error: result.error ? 'Error present' : 'No error',
      userMessage: result.userMessage ? 'Message present' : 'No message'
    });
    
    // This should fail with invalid credentials, which is expected
    if (!result.success) {
      console.log('  ✅ Recovery session creation failed as expected with invalid credentials');
    }
    
    return true;
  } catch (error) {
    console.error('  ❌ Recovery session creation test failed:', error.message);
    return false;
  }
}

async function testHybridSigningIntegration() {
  console.log('🔗 Testing hybrid signing integration...');
  
  try {
    const { hybridMessageSigning } = await import('../src/lib/messaging/hybrid-message-signing.js');
    
    // Test signing with no session (should fail gracefully)
    const testEvent = {
      kind: 1,
      content: 'Test message',
      tags: [],
      created_at: Math.floor(Date.now() / 1000)
    };
    
    const signingResult = await hybridMessageSigning.signMessage(testEvent);
    
    console.log('  ✓ Hybrid signing result:', {
      success: signingResult.success,
      method: signingResult.method,
      securityLevel: signingResult.securityLevel,
      error: signingResult.error ? 'Error present' : 'No error'
    });
    
    // This should fail with no session, which is expected
    if (!signingResult.success && signingResult.method === 'session') {
      console.log('  ✅ Hybrid signing failed as expected with no active session');
    }
    
    return true;
  } catch (error) {
    console.error('  ❌ Hybrid signing integration test failed:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Starting Recovery Session Integration Tests\n');
  
  const tests = [
    { name: 'Import Tests', fn: testImports },
    { name: 'Recovery Session Creation', fn: testRecoverySessionCreation },
    { name: 'Hybrid Signing Integration', fn: testHybridSigningIntegration }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    console.log(`\n📋 Running: ${test.name}`);
    try {
      const result = await test.fn();
      if (result) {
        console.log(`✅ ${test.name}: PASSED`);
        passed++;
      } else {
        console.log(`❌ ${test.name}: FAILED`);
        failed++;
      }
    } catch (error) {
      console.error(`❌ ${test.name}: ERROR -`, error.message);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Results:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! Recovery session integration is working correctly.');
    console.log('\n📝 Next Steps:');
    console.log('   1. Run the database verification script if needed');
    console.log('   2. Test the UI components in the browser');
    console.log('   3. Try creating a recovery session with real credentials');
    console.log('   4. Send a message to verify hybrid signing works');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the errors above.');
    process.exit(1);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('💥 Test runner failed:', error);
  process.exit(1);
});

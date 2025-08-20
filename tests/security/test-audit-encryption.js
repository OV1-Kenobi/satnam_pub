/**
 * Test script to verify the audit details encryption implementation
 * Run this to ensure the encryption is working properly before production
 */

import { createAuditLog, decryptAuditDetails } from './services/privacy-auth.js';

async function testAuditEncryption() {
  console.log('🔒 Testing audit details encryption...');
  
  try {
    // Test data with PII that should be encrypted
    const testDetails = {
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      ip_address: '192.168.1.100',
      session_id: 'test-session-123',
      error_message: 'Authentication failed: invalid credentials',
      timestamp: new Date().toISOString(),
      sensitive_data: 'This should be encrypted in production'
    };

    console.log('📝 Original audit details:', JSON.stringify(testDetails, null, 2));

    // Create audit log entry (this will encrypt the details)
    const auditLog = await createAuditLog(
      'test-user-id',
      'test_encryption',
      true,
      testDetails
    );

    console.log('✅ Audit log created with encrypted details');
    console.log('🔐 Encrypted details length:', auditLog.encrypted_details?.length || 0);
    
    // Verify that encrypted details don't contain plaintext
    if (auditLog.encrypted_details?.includes('This should be encrypted')) {
      console.error('❌ ERROR: Plaintext found in encrypted details!');
      return false;
    }

    // Test decryption
    if (auditLog.encrypted_details) {
      const decryptedDetails = await decryptAuditDetails(auditLog.encrypted_details);
      console.log('🔓 Decrypted audit details:', JSON.stringify(decryptedDetails, null, 2));
      
      // Verify decryption worked correctly
      if (JSON.stringify(decryptedDetails) === JSON.stringify(testDetails)) {
        console.log('✅ Encryption/decryption cycle successful!');
        return true;
      } else {
        console.error('❌ ERROR: Decrypted data doesn\'t match original!');
        return false;
      }
    } else {
      console.error('❌ ERROR: No encrypted details found!');
      return false;
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testAuditEncryption().then(success => {
    if (success) {
      console.log('\n🎉 All tests passed! Audit encryption is ready for production.');
      process.exit(0);
    } else {
      console.log('\n💥 Tests failed! Do not deploy to production.');
      process.exit(1);
    }
  }).catch(error => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  });
}

export { testAuditEncryption };

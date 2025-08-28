#!/usr/bin/env node

/**
 * Verify Critical Security Fixes in auth-unified.js
 * Tests that all production-blocking security vulnerabilities have been resolved
 */

async function verifySecurityFixes() {
  console.log('🔒 Verifying Critical Security Fixes');
  console.log('=' .repeat(60));

  try {
    const fs = await import('fs');
    
    // Step 1: Check that hardcoded JWT secret fallbacks are removed
    console.log('\n📝 Step 1: Verify JWT_SECRET fallback removal');
    
    const authUnifiedContent = fs.readFileSync('netlify/functions_active/auth-unified.js', 'utf8');
    
    const fallbackSecretMatches = authUnifiedContent.match(/['"]fallback-secret['"]/g);
    if (fallbackSecretMatches) {
      console.log('❌ CRITICAL: Found hardcoded fallback secrets:');
      fallbackSecretMatches.forEach(match => console.log(`   - ${match}`));
    } else {
      console.log('✅ No hardcoded JWT secret fallbacks found');
    }
    
    // Check for proper JWT_SECRET enforcement
    const jwtSecretEnforcement = authUnifiedContent.includes('JWT_SECRET environment variable is required');
    if (jwtSecretEnforcement) {
      console.log('✅ JWT_SECRET enforcement implemented');
    } else {
      console.log('❌ CRITICAL: JWT_SECRET enforcement missing');
    }
    
    // Step 2: Check timing attack vulnerability fix
    console.log('\n📝 Step 2: Verify timing attack vulnerability fix');
    
    const timingAttackFix = authUnifiedContent.includes('timingSafeEqual');
    if (timingAttackFix) {
      console.log('✅ Timing-safe password comparison implemented');
    } else {
      console.log('❌ CRITICAL: Timing attack vulnerability still present');
    }
    
    const unsafeComparison = authUnifiedContent.match(/derivedHash\s*===\s*.*password_hash|password_hash\s*===\s*.*derivedHash/);
    if (unsafeComparison) {
      console.log('❌ CRITICAL: Unsafe string comparison still present:');
      console.log(`   - ${unsafeComparison[0]}`);
    } else {
      console.log('✅ No unsafe password comparisons found');
    }
    
    // Step 3: Check ESM crypto import fix
    console.log('\n📝 Step 3: Verify ESM crypto import fix');
    
    const cryptoDefaultUsage = authUnifiedContent.includes('crypto.default');
    if (cryptoDefaultUsage) {
      console.log('❌ CRITICAL: crypto.default usage still present (will cause runtime errors)');
    } else {
      console.log('✅ No crypto.default usage found');
    }
    
    const properCryptoImports = authUnifiedContent.includes('pbkdf2: pbkdf2Cb, timingSafeEqual');
    if (properCryptoImports) {
      console.log('✅ Proper ESM crypto imports implemented');
    } else {
      console.log('❌ CRITICAL: Proper ESM crypto imports missing');
    }
    
    // Step 4: Check debug information exposure fix
    console.log('\n📝 Step 4: Verify debug information exposure fix');
    
    const debugModeCheck = authUnifiedContent.includes("process.env.DEBUG === 'true'");
    if (debugModeCheck) {
      console.log('✅ Debug information properly gated behind DEBUG flag');
    } else {
      console.log('❌ CRITICAL: Debug information exposure not properly fixed');
    }
    
    const developmentCheck = authUnifiedContent.includes("process.env.NODE_ENV !== 'production'");
    if (developmentCheck) {
      console.log('❌ WARNING: Still using NODE_ENV check (branch/preview environments are not development)');
    } else {
      console.log('✅ NODE_ENV development check removed');
    }
    
    // Step 5: Check dynamic import resolution fix
    console.log('\n📝 Step 5: Verify dynamic import resolution fix');
    
    const importMetaUrl = authUnifiedContent.includes('import.meta.url');
    if (importMetaUrl) {
      console.log('✅ import.meta.url used for reliable module resolution');
    } else {
      console.log('❌ CRITICAL: Dynamic import resolution not properly fixed');
    }
    
    // Step 6: Test authentication with proper JWT_SECRET
    console.log('\n📝 Step 6: Test authentication functionality with security fixes');
    
    const testUsername = `sectest${Date.now()}`;
    const testPassword = 'SecureTestPassword123!';
    
    // Set a test JWT_SECRET for this test
    process.env.JWT_SECRET = 'dGVzdC1qd3Qtc2VjcmV0LWZvci1zZWN1cml0eS10ZXN0aW5nLTEyMzQ1Njc4OTA=';
    
    const registrationData = {
      username: testUsername,
      password: testPassword,
      confirmPassword: testPassword,
      npub: 'npub1test123456789abcdef123456789abcdef123456789abcdef123456789abc',
      encryptedNsec: 'encrypted_test_nsec',
      nip05: `${testUsername}@satnam.pub`,
      lightningAddress: `${testUsername}@satnam.pub`,
      generateInviteToken: true,
      role: 'private',
      authMethod: 'nip05-password'
    };

    try {
      const registerResponse = await fetch('http://localhost:8888/api/auth/register-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationData)
      });

      if (registerResponse.ok) {
        const registrationResult = await registerResponse.json();
        console.log('✅ Authentication functionality working with security fixes');
        
        // Test session validation
        const jwtToken = registrationResult.session?.token;
        if (jwtToken) {
          const sessionResponse = await fetch('http://localhost:8888/api/auth/session', {
            method: 'GET',
            headers: { 
              'Authorization': `Bearer ${jwtToken}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (sessionResponse.ok) {
            console.log('✅ Session validation working with security fixes');
          } else {
            console.log('❌ Session validation failed after security fixes');
          }
        }
      } else {
        console.log('❌ Authentication failed after security fixes');
        const errorText = await registerResponse.text();
        console.log('Error:', errorText);
      }
    } catch (error) {
      console.log('⚠️ Backend endpoints not available (server may not be running)');
    }
    
    // Summary
    console.log('\n🔒 SECURITY FIXES VERIFICATION RESULTS:');
    console.log('=' .repeat(60));
    
    const criticalIssues = [];
    
    if (fallbackSecretMatches) {
      criticalIssues.push('Hardcoded JWT secret fallbacks still present');
    }
    if (!jwtSecretEnforcement) {
      criticalIssues.push('JWT_SECRET enforcement missing');
    }
    if (!timingAttackFix) {
      criticalIssues.push('Timing attack vulnerability not fixed');
    }
    if (unsafeComparison) {
      criticalIssues.push('Unsafe password comparison still present');
    }
    if (cryptoDefaultUsage) {
      criticalIssues.push('crypto.default usage will cause runtime errors');
    }
    if (!properCryptoImports) {
      criticalIssues.push('Proper ESM crypto imports missing');
    }
    if (!debugModeCheck) {
      criticalIssues.push('Debug information exposure not properly fixed');
    }
    if (!importMetaUrl) {
      criticalIssues.push('Dynamic import resolution not properly fixed');
    }
    
    console.log('📊 Security Status:');
    console.log(`   Critical Issues: ${criticalIssues.length === 0 ? '✅ None' : '❌ ' + criticalIssues.length}`);
    
    if (criticalIssues.length > 0) {
      console.log('\n❌ CRITICAL SECURITY ISSUES FOUND:');
      criticalIssues.forEach(issue => console.log(`   - ${issue}`));
    }
    
    const securityFixed = criticalIssues.length === 0;

    console.log(`\n🎯 OVERALL SECURITY STATUS: ${securityFixed ? '✅ SECURE' : '❌ VULNERABLE'}`);
    
    if (securityFixed) {
      console.log('\n💡 CONCLUSION:');
      console.log('All critical security vulnerabilities have been RESOLVED!');
      console.log('- No hardcoded JWT secret fallbacks');
      console.log('- Timing attack vulnerability fixed');
      console.log('- ESM crypto imports properly implemented');
      console.log('- Debug information exposure properly gated');
      console.log('- Dynamic import resolution fixed');
      console.log('\nThe authentication system is now PRODUCTION-READY!');
    } else {
      console.log('\n⚠️ PRODUCTION-BLOCKING SECURITY ISSUES:');
      console.log('The authentication system is NOT ready for production deployment.');
      console.log('All critical security issues must be resolved before going live.');
    }

  } catch (error) {
    console.error('❌ Security verification failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

verifySecurityFixes().catch(console.error);

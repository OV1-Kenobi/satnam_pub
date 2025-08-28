#!/usr/bin/env node

/**
 * Comprehensive JWT Token Format Standardization Test
 * Tests JWT token compatibility across all authentication endpoints
 */

async function testJWTStandardization() {
  console.log('🧪 Testing JWT Token Format Standardization Across All Endpoints');
  console.log('=' .repeat(70));

  const testResults = {
    registration: { success: false, token: null, parsing: false },
    signin: { success: false, token: null, parsing: false },
    sessionValidation: { success: false, compatible: false }
  };

  try {
    // Test 1: Registration Endpoint JWT Token
    console.log('\n📝 TEST 1: Registration Endpoint JWT Token');
    console.log('-' .repeat(50));
    
    const testUsername = `testuser${Date.now()}`;
    const testPassword = 'TestPassword123!';
    
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

    const registerResponse = await fetch('http://localhost:8888/api/auth/register-identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registrationData)
    });

    if (registerResponse.ok) {
      const registrationResult = await registerResponse.json();
      const regToken = registrationResult.session?.token;
      
      if (regToken) {
        testResults.registration.success = true;
        testResults.registration.token = regToken;
        
        // Parse and validate token structure
        const regPayload = parseJWTPayload(regToken);
        testResults.registration.parsing = validateTokenStructure(regPayload, 'Registration');
        
        console.log('✅ Registration JWT token created successfully');
        console.log('📊 Token structure:', getTokenSummary(regPayload));
      } else {
        console.error('❌ Registration: No token returned');
      }
    } else {
      console.error('❌ Registration failed:', await registerResponse.text());
    }

    // Test 2: Signin Endpoint JWT Token
    console.log('\n📝 TEST 2: Signin Endpoint JWT Token');
    console.log('-' .repeat(50));
    
    const signinData = {
      nip05: `${testUsername}@satnam.pub`,
      password: testPassword,
      authMethod: 'nip05-password'
    };

    const signinResponse = await fetch('http://localhost:8888/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signinData)
    });

    if (signinResponse.ok) {
      const signinResult = await signinResponse.json();
      const signinToken = signinResult.session?.token;
      
      if (signinToken) {
        testResults.signin.success = true;
        testResults.signin.token = signinToken;
        
        // Parse and validate token structure
        const signinPayload = parseJWTPayload(signinToken);
        testResults.signin.parsing = validateTokenStructure(signinPayload, 'Signin');
        
        console.log('✅ Signin JWT token created successfully');
        console.log('📊 Token structure:', getTokenSummary(signinPayload));
      } else {
        console.error('❌ Signin: No token returned');
      }
    } else {
      console.error('❌ Signin failed:', await signinResponse.text());
    }

    // Test 3: Session Validation Compatibility
    console.log('\n📝 TEST 3: Session Validation Compatibility');
    console.log('-' .repeat(50));
    
    // Test both tokens with session validation endpoint
    const tokensToTest = [
      { name: 'Registration', token: testResults.registration.token },
      { name: 'Signin', token: testResults.signin.token }
    ];

    let allCompatible = true;
    
    for (const { name, token } of tokensToTest) {
      if (token) {
        const sessionResponse = await fetch('http://localhost:8888/api/auth/session', {
          method: 'GET',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (sessionResponse.ok) {
          console.log(`✅ ${name} token: Compatible with session validation`);
        } else {
          console.error(`❌ ${name} token: NOT compatible with session validation`);
          const errorText = await sessionResponse.text();
          console.error(`   Error: ${errorText}`);
          allCompatible = false;
        }
      }
    }

    testResults.sessionValidation.success = true;
    testResults.sessionValidation.compatible = allCompatible;

    // Test 4: Frontend Parsing Simulation
    console.log('\n📝 TEST 4: Frontend SecureTokenManager Parsing Simulation');
    console.log('-' .repeat(50));
    
    let frontendCompatible = true;
    
    for (const { name, token } of tokensToTest) {
      if (token) {
        const payload = parseJWTPayload(token);
        const frontendParsing = simulateFrontendParsing(payload);
        
        if (frontendParsing.success) {
          console.log(`✅ ${name} token: Frontend parsing successful`);
        } else {
          console.error(`❌ ${name} token: Frontend parsing failed - ${frontendParsing.error}`);
          frontendCompatible = false;
        }
      }
    }

    // Final Results Summary
    console.log('\n🎉 JWT STANDARDIZATION TEST RESULTS:');
    console.log('=' .repeat(70));
    
    console.log('📊 Endpoint Results:');
    console.log(`   Registration: ${testResults.registration.success ? '✅' : '❌'} Token Creation, ${testResults.registration.parsing ? '✅' : '❌'} Structure`);
    console.log(`   Signin: ${testResults.signin.success ? '✅' : '❌'} Token Creation, ${testResults.signin.parsing ? '✅' : '❌'} Structure`);
    console.log(`   Session Validation: ${testResults.sessionValidation.compatible ? '✅' : '❌'} Cross-Compatibility`);
    console.log(`   Frontend Parsing: ${frontendCompatible ? '✅' : '❌'} SecureTokenManager Compatibility`);

    const overallSuccess = testResults.registration.success && testResults.registration.parsing &&
                          testResults.signin.success && testResults.signin.parsing &&
                          testResults.sessionValidation.compatible && frontendCompatible;

    console.log(`\n🎯 OVERALL RESULT: ${overallSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
    
    if (overallSuccess) {
      console.log('\n💡 CONCLUSION:');
      console.log('JWT token format standardization is COMPLETE! All endpoints now create');
      console.log('tokens with unified payload structure that are compatible with:');
      console.log('- Frontend SecureTokenManager.parseTokenPayload()');
      console.log('- Backend session validation endpoints');
      console.log('- Cross-endpoint token compatibility');
      console.log('\nThe Identity Forge post-registration authentication failure should be RESOLVED!');
    } else {
      console.log('\n⚠️  ISSUES FOUND:');
      console.log('Some endpoints still have JWT token format inconsistencies.');
      console.log('Additional standardization work is required.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Helper Functions
function parseJWTPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1]));
  } catch (error) {
    return null;
  }
}

function validateTokenStructure(payload, endpointName) {
  if (!payload) {
    console.error(`❌ ${endpointName}: Invalid token structure`);
    return false;
  }

  const requiredFields = ['userId', 'hashedId', 'type', 'sessionId', 'exp'];
  const missingFields = requiredFields.filter(field => !payload[field]);
  
  if (missingFields.length > 0) {
    console.error(`❌ ${endpointName}: Missing required fields: ${missingFields.join(', ')}`);
    return false;
  }

  console.log(`✅ ${endpointName}: All required fields present`);
  return true;
}

function getTokenSummary(payload) {
  if (!payload) return 'Invalid payload';
  
  return {
    userId: payload.userId?.substring(0, 10) + '...',
    hashedId: payload.hashedId ? '✅ Present' : '❌ Missing',
    type: payload.type || '❌ Missing',
    sessionId: payload.sessionId ? '✅ Present' : '❌ Missing',
    username: payload.username || '❌ Missing',
    nip05: payload.nip05 || '❌ Missing',
    role: payload.role || '❌ Missing',
    exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : '❌ Missing'
  };
}

function simulateFrontendParsing(payload) {
  try {
    // Simulate SecureTokenManager.parseTokenPayload() logic
    if (!payload.hashedId || !payload.exp || !payload.type) {
      return { success: false, error: 'Missing required fields: hashedId, exp, or type' };
    }
    
    return { success: true, payload: payload };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

testJWTStandardization().catch(console.error);

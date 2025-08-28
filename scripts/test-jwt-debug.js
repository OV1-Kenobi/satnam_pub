#!/usr/bin/env node

/**
 * Test JWT Debug
 * Tests JWT creation and verification to debug the session validation issue
 */

async function testJWTDebug() {
  console.log('🧪 Testing JWT Creation and Verification');
  console.log('=' .repeat(50));

  try {
    // Step 1: Test signin to get a JWT token
    console.log('\n📝 Step 1: Get JWT token from signin');
    
    const testUsername = `testuser${Date.now()}`;
    const testPassword = 'TestPassword123!';
    
    // First register a user
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

    if (!registerResponse.ok) {
      console.error('❌ Registration failed:', await registerResponse.text());
      return;
    }

    console.log('✅ Registration successful');

    // Now signin to get a JWT token
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

    if (!signinResponse.ok) {
      console.error('❌ Signin failed:', await signinResponse.text());
      return;
    }

    const signinData_response = await signinResponse.json();
    const jwtToken = signinData_response.session?.token;

    if (!jwtToken) {
      console.error('❌ No JWT token received from signin');
      return;
    }

    console.log('✅ JWT token received');
    console.log('📊 Token preview:', jwtToken.substring(0, 50) + '...');

    // Step 2: Analyze the JWT token structure
    console.log('\n📝 Step 2: Analyze JWT token structure');
    
    const parts = jwtToken.split('.');
    console.log('📊 JWT parts count:', parts.length);
    
    if (parts.length === 3) {
      try {
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        
        console.log('📊 JWT Header:', header);
        console.log('📊 JWT Payload:', {
          userId: payload.userId,
          username: payload.username,
          iss: payload.iss,
          aud: payload.aud,
          iat: payload.iat ? new Date(payload.iat * 1000).toISOString() : 'missing',
          exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'missing'
        });
      } catch (parseError) {
        console.error('❌ Failed to parse JWT:', parseError.message);
      }
    }

    // Step 3: Test session validation with the token
    console.log('\n📝 Step 3: Test session validation');
    
    const sessionResponse = await fetch('http://localhost:8888/api/auth/session', {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('📊 Session validation status:', sessionResponse.status);
    
    const sessionResponseText = await sessionResponse.text();
    console.log('📊 Session response:', sessionResponseText);

    if (sessionResponse.ok) {
      console.log('✅ Session validation successful');
    } else {
      console.log('❌ Session validation failed');
      
      // Try to get more debug info
      try {
        const errorData = JSON.parse(sessionResponseText);
        if (errorData.debug) {
          console.log('📊 Debug info:', errorData.debug);
        }
      } catch (e) {
        console.log('📊 Raw error response:', sessionResponseText);
      }
    }

    // Step 4: Test environment variables
    console.log('\n📝 Step 4: Check JWT configuration');
    console.log('📊 NODE_ENV:', process.env.NODE_ENV || 'not set');
    console.log('📊 JWT_SECRET exists:', !!process.env.JWT_SECRET);
    console.log('📊 JWKS_URI exists:', !!process.env.JWKS_URI);
    console.log('📊 JWT_ISSUER:', process.env.JWT_ISSUER || 'not set (default: satnam.pub)');
    console.log('📊 JWT_AUDIENCE:', process.env.JWT_AUDIENCE || 'not set (default: satnam.pub)');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testJWTDebug().catch(console.error);

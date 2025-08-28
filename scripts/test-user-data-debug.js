#!/usr/bin/env node

/**
 * Test User Data Debug
 * Tests what user data is being retrieved from the database
 */

async function testUserDataDebug() {
  console.log('🧪 Testing User Data Retrieval');
  console.log('=' .repeat(50));

  try {
    // Register a user first
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

    console.log('📝 Step 1: Register user');
    const registerResponse = await fetch('http://localhost:8888/api/auth/register-identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registrationData)
    });

    if (!registerResponse.ok) {
      const errorText = await registerResponse.text();
      console.error('❌ Registration failed:', errorText);
      return;
    }

    const registerData = await registerResponse.json();
    console.log('✅ Registration successful');
    console.log('📊 Registration response user data:', {
      hasUser: !!registerData.user,
      userId: registerData.user?.id?.substring(0, 8),
      username: registerData.user?.username,
      nip05: registerData.user?.nip05,
      role: registerData.user?.role
    });

    // Now try to signin and check server logs
    console.log('\n📝 Step 2: Signin to see user data debug logs');
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

    console.log('📊 Signin status:', signinResponse.status);
    
    if (signinResponse.ok) {
      const signinResponseData = await signinResponse.json();
      console.log('✅ Signin successful');
      console.log('📊 Signin response user data:', {
        hasUser: !!signinResponseData.user,
        userId: signinResponseData.user?.id?.substring(0, 8),
        username: signinResponseData.user?.username,
        nip05: signinResponseData.user?.nip05,
        role: signinResponseData.user?.role
      });
    } else {
      const errorText = await signinResponse.text();
      console.error('❌ Signin failed:', errorText);
    }

    console.log('\n💡 Check the server logs above for debug output from the signin function');
    console.log('💡 Look for "Environment debug" and "User data debug" messages');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testUserDataDebug().catch(console.error);

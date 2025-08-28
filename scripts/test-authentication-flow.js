#!/usr/bin/env node

/**
 * Test Authentication Flow
 * Tests the complete registration -> authentication -> session flow
 */

import { nip19 } from 'nostr-tools';

async function testCompleteAuthFlow() {
  console.log('🧪 Testing Complete Authentication Flow');
  console.log('=' .repeat(60));

  const testUsername = `testuser${Date.now()}`;
  const testPassword = 'TestPassword123!';
  
  try {
    // STEP 1: Register a new user
    console.log('\n📝 STEP 1: User Registration');
    console.log('=' .repeat(40));
    
    const testPrivateKeyHex = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const testPrivateKeyBytes = new Uint8Array(
      testPrivateKeyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
    );
    const testNsecBech32 = nip19.nsecEncode(testPrivateKeyBytes);
    const testNpubBech32 = nip19.npubEncode(testPrivateKeyHex);

    const mockEncryptedNsec = `encrypted_${testNsecBech32.substring(5, 20)}`;

    const registrationData = {
      username: testUsername,
      password: testPassword,
      confirmPassword: testPassword,
      npub: testNpubBech32,
      encryptedNsec: mockEncryptedNsec,
      nip05: `${testUsername}@satnam.pub`,
      lightningAddress: `${testUsername}@satnam.pub`,
      generateInviteToken: true,
      role: 'private',
      authMethod: 'nip05-password'
    };

    console.log('🔄 Registering user:', testUsername);
    const registerResponse = await fetch('http://localhost:8888/api/auth/register-identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registrationData)
    });

    console.log('📊 Registration status:', registerResponse.status);
    
    if (!registerResponse.ok) {
      const errorData = await registerResponse.json();
      console.error('❌ Registration failed:', errorData);
      return;
    }

    const registerData = await registerResponse.json();
    console.log('✅ Registration successful');
    console.log('📊 Registration response:', {
      success: registerData.success,
      hasUser: !!registerData.user,
      hasSession: !!registerData.session,
      hasToken: !!registerData.session?.token
    });

    // STEP 2: Test authentication with the new credentials
    console.log('\n📝 STEP 2: User Authentication');
    console.log('=' .repeat(40));

    const authData = {
      nip05: `${testUsername}@satnam.pub`,
      password: testPassword,
      authMethod: 'nip05-password'
    };

    console.log('🔄 Authenticating user:', testUsername);
    const authResponse = await fetch('http://localhost:8888/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authData)
    });

    console.log('📊 Authentication status:', authResponse.status);
    
    if (!authResponse.ok) {
      const errorData = await authResponse.json();
      console.error('❌ Authentication failed:', errorData);
      console.error('🚨 CRITICAL: User cannot sign in with newly created credentials!');
      return;
    }

    const authResponseData = await authResponse.json();
    console.log('✅ Authentication successful');
    console.log('📊 Auth response:', {
      success: authResponseData.success,
      hasUser: !!authResponseData.user,
      hasSession: !!authResponseData.session,
      hasToken: !!authResponseData.session?.token
    });

    // STEP 3: Test session validation
    console.log('\n📝 STEP 3: Session Validation');
    console.log('=' .repeat(40));

    const sessionToken = authResponseData.session?.token;
    if (!sessionToken) {
      console.error('❌ No session token received from authentication');
      return;
    }

    console.log('🔄 Testing session with protected endpoint');
    const sessionResponse = await fetch('http://localhost:8888/api/auth/session', {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('📊 Session validation status:', sessionResponse.status);
    
    if (!sessionResponse.ok) {
      const errorData = await sessionResponse.json();
      console.error('❌ Session validation failed:', errorData);
      console.error('🚨 CRITICAL: Session is not valid for protected endpoints!');
      return;
    }

    const sessionData = await sessionResponse.json();
    console.log('✅ Session validation successful');
    console.log('📊 Session data:', {
      hasUser: !!sessionData.user,
      username: sessionData.user?.username,
      role: sessionData.user?.role
    });

    // STEP 4: Test peer invitation functionality
    console.log('\n📝 STEP 4: Peer Invitation Test');
    console.log('=' .repeat(40));

    console.log('🔄 Testing peer invitation endpoint');
    const inviteResponse = await fetch('http://localhost:8888/api/authenticated/generate-peer-invite', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inviteType: 'peer',
        message: 'Test invitation',
        expiresIn: 24
      })
    });

    console.log('📊 Peer invitation status:', inviteResponse.status);
    
    if (!inviteResponse.ok) {
      const errorData = await inviteResponse.json();
      console.error('❌ Peer invitation failed:', errorData);
      console.error('🚨 CRITICAL: Peer invitation system is not working!');
    } else {
      const inviteData = await inviteResponse.json();
      console.log('✅ Peer invitation successful');
      console.log('📊 Invitation data:', {
        success: inviteData.success,
        hasInviteCode: !!inviteData.inviteCode,
        hasQrCode: !!inviteData.qrCode
      });
    }

    console.log('\n🎉 COMPLETE FLOW TEST RESULTS:');
    console.log('=' .repeat(60));
    console.log('✅ Registration: WORKING');
    console.log('✅ Authentication: WORKING');
    console.log('✅ Session Validation: WORKING');
    console.log(inviteResponse.ok ? '✅ Peer Invitations: WORKING' : '❌ Peer Invitations: BROKEN');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

async function testDatabasePersistence() {
  console.log('\n🧪 Testing Database Persistence');
  console.log('=' .repeat(60));

  // This would require direct database access to verify
  // For now, we'll test indirectly through authentication
  console.log('💡 Database persistence tested indirectly through authentication flow');
  console.log('💡 If authentication works, data was persisted correctly');
}

async function runAllTests() {
  await testCompleteAuthFlow();
  await testDatabasePersistence();
  
  console.log('\n📋 DIAGNOSIS SUMMARY:');
  console.log('=' .repeat(60));
  console.log('1. If registration returns 201 but auth fails → Database persistence issue');
  console.log('2. If auth works but session fails → JWT/session management issue');
  console.log('3. If session works but invites fail → Peer invitation system issue');
  console.log('4. If all work → Platform is functional (previous issues resolved)');
}

runAllTests().catch(console.error);

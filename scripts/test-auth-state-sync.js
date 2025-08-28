#!/usr/bin/env node

/**
 * Test Authentication State Synchronization
 * Verifies that authentication state is properly synchronized after registration
 */

async function testAuthStateSync() {
  console.log('🧪 Testing Authentication State Synchronization');
  console.log('=' .repeat(60));

  try {
    // Step 1: Simulate successful registration
    console.log('\n📝 Step 1: Simulate successful registration');
    
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

    if (!registerResponse.ok) {
      console.error('❌ Registration failed:', await registerResponse.text());
      return;
    }

    const registrationResult = await registerResponse.json();
    const jwtToken = registrationResult.session?.token;
    
    if (!jwtToken) {
      console.error('❌ No JWT token returned from registration');
      return;
    }

    console.log('✅ Registration successful');
    console.log('📊 Registration result:', {
      success: registrationResult.success,
      hasUser: !!registrationResult.user,
      hasSession: !!registrationResult.session,
      hasToken: !!jwtToken,
      userRole: registrationResult.user?.role,
      userId: registrationResult.user?.id?.substring(0, 20) + '...',
      isActive: registrationResult.user?.is_active
    });

    // Step 2: Parse JWT token to check payload
    console.log('\n📝 Step 2: Parse JWT token payload');
    
    let tokenPayload = null;
    try {
      const parts = jwtToken.split('.');
      if (parts.length !== 3) {
        console.error('❌ Invalid JWT format');
        return;
      }

      tokenPayload = JSON.parse(atob(parts[1]));
      console.log('✅ JWT token parsed successfully');
      console.log('📊 Token payload:', {
        userId: tokenPayload.userId?.substring(0, 20) + '...',
        hashedId: tokenPayload.hashedId ? '✅ Present' : '❌ Missing',
        type: tokenPayload.type || '❌ Missing',
        sessionId: tokenPayload.sessionId ? '✅ Present' : '❌ Missing',
        username: tokenPayload.username || '❌ Missing',
        nip05: tokenPayload.nip05 || '❌ Missing',
        role: tokenPayload.role || '❌ Missing',
        exp: tokenPayload.exp,
        expiryDate: new Date(tokenPayload.exp * 1000).toISOString(),
        isExpired: tokenPayload.exp * 1000 < Date.now()
      });

    } catch (parseError) {
      console.error('❌ Failed to parse JWT token:', parseError.message);
      return;
    }

    // Step 3: Test session validation immediately after registration
    console.log('\n📝 Step 3: Test immediate session validation');
    
    const sessionResponse = await fetch('http://localhost:8888/api/auth/session', {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('📊 Session validation status:', sessionResponse.status);
    
    if (sessionResponse.ok) {
      const sessionData = await sessionResponse.json();
      console.log('✅ Session validation successful');
      console.log('📊 Session data:', {
        authenticated: sessionData.data?.authenticated,
        hasUser: !!sessionData.data?.user,
        userId: sessionData.data?.user?.id?.substring(0, 20) + '...',
        username: sessionData.data?.user?.username,
        role: sessionData.data?.user?.role,
        isActive: sessionData.data?.user?.is_active,
        accountActive: sessionData.data?.accountActive
      });

      // Step 4: Check for authentication state consistency
      console.log('\n📝 Step 4: Check authentication state consistency');
      
      const userFromRegistration = registrationResult.user;
      const userFromSession = sessionData.data?.user;
      
      console.log('📊 User data consistency check:');
      console.log(`   Registration user.id: ${userFromRegistration?.id?.substring(0, 20)}...`);
      console.log(`   Session user.id: ${userFromSession?.id?.substring(0, 20)}...`);
      console.log(`   IDs match: ${userFromRegistration?.id === userFromSession?.id ? '✅' : '❌'}`);
      console.log(`   Registration user.is_active: ${userFromRegistration?.is_active}`);
      console.log(`   Session user.is_active: ${userFromSession?.is_active}`);
      console.log(`   Active status match: ${userFromRegistration?.is_active === userFromSession?.is_active ? '✅' : '❌'}`);
      console.log(`   Registration user.role: ${userFromRegistration?.role}`);
      console.log(`   Session user.role: ${userFromSession?.role}`);
      console.log(`   Role match: ${userFromRegistration?.role === userFromSession?.role ? '✅' : '❌'}`);

      // Step 5: Simulate handleAuthSuccess logic
      console.log('\n📝 Step 5: Simulate handleAuthSuccess logic');
      
      const authResult = {
        success: true,
        sessionToken: jwtToken,
        user: {
          id: userFromRegistration?.id || 'unknown',
          npub: 'npub1test123456789abcdef123456789abcdef123456789abcdef123456789abc',
          nip05: `${testUsername}@satnam.pub`,
          role: userFromRegistration?.role || 'private',
          username: userFromRegistration?.username || testUsername,
          is_active: true, // This is what Identity Forge sets
          hashedId: tokenPayload?.hashedId || 'unknown'
        }
      };

      console.log('✅ Simulated authResult for handleAuthSuccess:');
      console.log('📊 AuthResult structure:', {
        success: authResult.success,
        hasSessionToken: !!authResult.sessionToken,
        hasUser: !!authResult.user,
        userId: authResult.user.id?.substring(0, 20) + '...',
        userIsActive: authResult.user.is_active,
        userRole: authResult.user.role,
        tokenPayloadValid: !!tokenPayload
      });

      // Simulate the unified auth system logic
      const authenticated = authResult.success && !!authResult.user && !!authResult.sessionToken;
      const accountActive = authResult.user ? !!authResult.user.is_active : false;
      const sessionValid = !!tokenPayload && tokenPayload.exp * 1000 > Date.now();

      console.log('📊 Unified auth system state simulation:');
      console.log(`   authenticated: ${authenticated}`);
      console.log(`   accountActive: ${accountActive}`);
      console.log(`   sessionValid: ${sessionValid}`);
      console.log(`   Should trigger logout: ${authenticated && !accountActive ? '❌ YES' : '✅ NO'}`);

      // Step 6: Test protected endpoint access
      console.log('\n📝 Step 6: Test protected endpoint access');
      
      const inviteResponse = await fetch('http://localhost:8888/api/authenticated/generate-peer-invite', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      console.log('📊 Protected endpoint status:', inviteResponse.status);
      
      if (inviteResponse.ok) {
        const inviteData = await inviteResponse.json();
        console.log('✅ Protected endpoint access successful');
        console.log('📊 Invite data:', {
          success: inviteData.success,
          hasInviteCode: !!inviteData.inviteCode,
          hasQrCode: !!inviteData.qrCode
        });
      } else {
        console.error('❌ Protected endpoint access failed');
        const errorText = await inviteResponse.text();
        console.error('Error:', errorText);
      }

    } else {
      console.error('❌ Session validation failed');
      const errorText = await sessionResponse.text();
      console.error('Error:', errorText);
      return;
    }

    // Summary
    console.log('\n🎉 AUTHENTICATION STATE SYNCHRONIZATION TEST RESULTS:');
    console.log('=' .repeat(60));
    
    const registrationWorking = registrationResult.success;
    const tokenValid = !!tokenPayload && tokenPayload.exp * 1000 > Date.now();
    const sessionValid = sessionResponse.ok;
    const protectedEndpointWorking = inviteResponse.ok;
    const authStateConsistent = authenticated && accountActive && sessionValid;
    
    console.log('📊 Test Results:');
    console.log(`   Registration: ${registrationWorking ? '✅' : '❌'} Working`);
    console.log(`   JWT Token: ${tokenValid ? '✅' : '❌'} Valid`);
    console.log(`   Session Validation: ${sessionValid ? '✅' : '❌'} Working`);
    console.log(`   Protected Endpoints: ${protectedEndpointWorking ? '✅' : '❌'} Working`);
    console.log(`   Auth State Consistent: ${authStateConsistent ? '✅' : '❌'} Consistent`);

    const overallSuccess = registrationWorking && tokenValid && sessionValid && protectedEndpointWorking && authStateConsistent;

    console.log(`\n🎯 OVERALL RESULT: ${overallSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
    
    if (overallSuccess) {
      console.log('\n💡 CONCLUSION:');
      console.log('Authentication state synchronization is working correctly!');
      console.log('- Registration creates valid user and JWT token');
      console.log('- Session validation confirms authentication state');
      console.log('- Protected endpoints are accessible');
      console.log('- Auth state logic should not trigger automatic logout');
      console.log('\nThe issue may be in frontend state management or timing.');
    } else {
      console.log('\n⚠️  ISSUES FOUND:');
      console.log('Authentication state synchronization has problems.');
      console.log('This could explain why SignInModal opens unexpectedly.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testAuthStateSync().catch(console.error);

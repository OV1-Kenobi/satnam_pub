#!/usr/bin/env node

/**
 * Test Frontend Authentication Integration
 * Verifies that all components use the unified authentication system
 */

async function testFrontendAuthIntegration() {
  console.log('🧪 Testing Frontend Authentication Integration');
  console.log('=' .repeat(60));

  try {
    // Step 1: Check authentication system imports in key components
    console.log('\n📝 Step 1: Verify authentication system imports');
    
    const fs = await import('fs');
    const path = await import('path');
    
    const componentsToCheck = [
      'src/components/IndividualFinancesDashboard.tsx',
      'src/components/ProtectedRoute.tsx',
      'src/components/IdentityForge.tsx'
    ];
    
    const authImportResults = {};
    
    for (const componentPath of componentsToCheck) {
      try {
        const content = fs.readFileSync(componentPath, 'utf8');
        
        // Check for different auth system imports
        const hasUnifiedAuth = content.includes("import { useAuth } from './auth/AuthProvider'") ||
                              content.includes("import { useAuth } from \"./auth/AuthProvider\"");
        const hasOldAuth = content.includes("import { useAuth } from '../hooks/useAuth'") ||
                          content.includes("import { useAuth } from \"../hooks/useAuth\"");
        const hasFamilyAuth = content.includes("useFamilyFederationAuth");
        
        authImportResults[componentPath] = {
          hasUnifiedAuth,
          hasOldAuth,
          hasFamilyAuth,
          status: hasUnifiedAuth && !hasOldAuth && !hasFamilyAuth ? '✅ CORRECT' : '❌ INCORRECT'
        };
        
        console.log(`📊 ${path.basename(componentPath)}:`);
        console.log(`   Unified Auth: ${hasUnifiedAuth ? '✅' : '❌'}`);
        console.log(`   Old Auth: ${hasOldAuth ? '❌' : '✅'}`);
        console.log(`   Family Auth: ${hasFamilyAuth ? '❌' : '✅'}`);
        console.log(`   Status: ${authImportResults[componentPath].status}`);
        
      } catch (error) {
        console.error(`❌ Failed to check ${componentPath}:`, error.message);
        authImportResults[componentPath] = { status: '❌ ERROR' };
      }
    }

    // Step 2: Test backend authentication endpoints
    console.log('\n📝 Step 2: Test backend authentication endpoints');
    
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
    
    console.log('✅ Registration successful');
    console.log('📊 Registration result:', {
      success: registrationResult.success,
      hasToken: !!jwtToken,
      userRole: registrationResult.user?.role
    });

    // Step 3: Test session validation with new format
    console.log('\n📝 Step 3: Test session validation with new format');
    
    const sessionResponse = await fetch('http://localhost:8888/api/auth/session', {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (sessionResponse.ok) {
      const sessionData = await sessionResponse.json();
      console.log('✅ Session validation successful');
      console.log('📊 Session response format:', {
        hasData: !!sessionData.data,
        authenticated: sessionData.data?.authenticated,
        hasUser: !!sessionData.data?.user,
        accountActive: sessionData.data?.accountActive,
        sessionValid: sessionData.data?.sessionValid
      });
      
      // Check if response format matches frontend expectations
      const expectedFields = ['authenticated', 'user', 'accountActive', 'sessionValid'];
      const missingFields = expectedFields.filter(field => sessionData.data?.[field] === undefined);
      
      if (missingFields.length === 0) {
        console.log('✅ Session response format matches frontend expectations');
      } else {
        console.error('❌ Missing fields in session response:', missingFields);
      }
      
    } else {
      console.error('❌ Session validation failed');
      return;
    }

    // Step 4: Test peer invitation endpoint
    console.log('\n📝 Step 4: Test peer invitation endpoint');
    
    const inviteResponse = await fetch('http://localhost:8888/api/authenticated/generate-peer-invite', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inviteType: 'peer',
        message: 'Test invitation',
        expiresIn: 24
      })
    });

    if (inviteResponse.ok) {
      const inviteData = await inviteResponse.json();
      console.log('✅ Peer invitation endpoint working');
      console.log('📊 Invitation result:', {
        success: inviteData.success,
        hasInviteCode: !!inviteData.inviteCode,
        hasQrCode: !!inviteData.qrCode
      });
    } else {
      console.error('❌ Peer invitation failed');
      const errorText = await inviteResponse.text();
      console.error('Error:', errorText);
    }

    // Step 5: Check for common authentication issues
    console.log('\n📝 Step 5: Check for common authentication issues');
    
    const commonIssues = [];
    
    // Check if any components still use old auth systems
    const incorrectAuthComponents = Object.entries(authImportResults)
      .filter(([_, result]) => result.status === '❌ INCORRECT')
      .map(([path, _]) => path);
    
    if (incorrectAuthComponents.length > 0) {
      commonIssues.push(`Components using incorrect auth system: ${incorrectAuthComponents.join(', ')}`);
    }
    
    // Check if session validation returns proper format
    if (sessionResponse.ok) {
      const sessionData = await sessionResponse.json();
      if (!sessionData.data?.authenticated) {
        commonIssues.push('Session validation not returning authenticated: true');
      }
      if (!sessionData.data?.accountActive) {
        commonIssues.push('Session validation not returning accountActive: true');
      }
    }
    
    if (commonIssues.length === 0) {
      console.log('✅ No common authentication issues found');
    } else {
      console.log('❌ Common authentication issues found:');
      commonIssues.forEach(issue => console.log(`   - ${issue}`));
    }

    // Summary
    console.log('\n🎉 FRONTEND AUTHENTICATION INTEGRATION TEST RESULTS:');
    console.log('=' .repeat(60));
    
    const allComponentsCorrect = Object.values(authImportResults).every(result => result.status === '✅ CORRECT');
    const registrationWorking = registrationResult.success;
    const sessionWorking = sessionResponse.ok;
    const invitationWorking = inviteResponse.ok;
    const noCommonIssues = commonIssues.length === 0;
    
    console.log('📊 Test Results:');
    console.log(`   Component Auth Imports: ${allComponentsCorrect ? '✅' : '❌'} ${allComponentsCorrect ? 'All Correct' : 'Some Incorrect'}`);
    console.log(`   Registration Endpoint: ${registrationWorking ? '✅' : '❌'} ${registrationWorking ? 'Working' : 'Failed'}`);
    console.log(`   Session Validation: ${sessionWorking ? '✅' : '❌'} ${sessionWorking ? 'Working' : 'Failed'}`);
    console.log(`   Peer Invitations: ${invitationWorking ? '✅' : '❌'} ${invitationWorking ? 'Working' : 'Failed'}`);
    console.log(`   Common Issues: ${noCommonIssues ? '✅' : '❌'} ${noCommonIssues ? 'None Found' : 'Issues Found'}`);

    const overallSuccess = allComponentsCorrect && registrationWorking && sessionWorking && invitationWorking && noCommonIssues;

    console.log(`\n🎯 OVERALL RESULT: ${overallSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
    
    if (overallSuccess) {
      console.log('\n💡 CONCLUSION:');
      console.log('Frontend authentication integration is COMPLETE!');
      console.log('- All components use the unified authentication system');
      console.log('- Backend endpoints return proper response formats');
      console.log('- Session validation works with frontend expectations');
      console.log('- Peer invitations are functional');
      console.log('\nThe persistent authentication state inconsistency should be RESOLVED!');
    } else {
      console.log('\n⚠️  ISSUES FOUND:');
      console.log('Some components of the authentication integration still have problems.');
      console.log('Additional fixes may be required for complete resolution.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testFrontendAuthIntegration().catch(console.error);

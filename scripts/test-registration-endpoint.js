#!/usr/bin/env node

/**
 * Test Registration Endpoint - Direct API Testing
 * Tests the fixed register-identity endpoint to verify module import resolution
 */

import { getEnvVar } from '../netlify/functions/utils/env.js';

async function testRegistrationEndpoint() {
  console.log('🧪 Testing Registration Endpoint');
  console.log('=' .repeat(50));

  // Test data for registration
  const testRegistrationData = {
    nip05: `test_${Date.now()}@satnam.pub`,
    npub: 'npub1test123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    password: 'TestPassword123!',
    role: 'private',
    authMethod: 'nip05-password'
  };

  try {
    console.log('🔄 Testing POST /api/auth/register-identity');
    console.log('📊 Test data:', {
      nip05: testRegistrationData.nip05,
      npub: testRegistrationData.npub.substring(0, 20) + '...',
      role: testRegistrationData.role,
      authMethod: testRegistrationData.authMethod
    });

    // Test with Netlify dev server
    const response = await fetch('http://localhost:8888/api/auth/register-identity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testRegistrationData)
    });

    console.log('📊 Response status:', response.status);
    console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Registration endpoint working!');
      console.log('📊 Response data:', {
        success: data.success,
        message: data.message,
        hasToken: !!data.token,
        hasUser: !!data.user
      });
    } else {
      const errorText = await response.text();
      console.error('❌ Registration failed');
      console.error('📊 Status:', response.status);
      console.error('📊 Error response:', errorText);
      
      // Check if it's still the module import error
      if (errorText.includes('Cannot find module') || errorText.includes('.mjs.js')) {
        console.error('🚨 Module import issue still exists!');
        console.error('💡 The .mjs to .js conversion may not have taken effect');
      }
    }

  } catch (error) {
    console.error('❌ Network/connection error:', error.message);
    console.error('💡 Make sure Netlify dev server is running on port 8888');
  }
}

async function testNetlifyDevStatus() {
  console.log('\n🔍 Checking Netlify Dev Server Status');
  console.log('=' .repeat(50));

  try {
    const response = await fetch('http://localhost:8888/.netlify/functions/auth-unified', {
      method: 'GET'
    });
    
    console.log('📊 Netlify Functions status:', response.status);
    
    if (response.status === 404) {
      console.log('✅ Netlify dev server is running (404 expected for GET request)');
    } else {
      console.log('📊 Unexpected status, but server is responding');
    }
  } catch (error) {
    console.error('❌ Netlify dev server not accessible:', error.message);
    console.error('💡 Start with: netlify dev');
  }
}

async function runTests() {
  await testNetlifyDevStatus();
  await testRegistrationEndpoint();
  
  console.log('\n📋 Next Steps:');
  console.log('1. If module import errors persist, check Netlify Functions cache');
  console.log('2. Verify register-identity.js file exists and is accessible');
  console.log('3. Test with IdentityForge component in browser');
  console.log('4. Check for any remaining .mjs references in codebase');
}

runTests().catch(console.error);

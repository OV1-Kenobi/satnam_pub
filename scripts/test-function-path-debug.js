#!/usr/bin/env node

/**
 * Test Function Path Debug
 * Tests what path information the invitation-unified function receives
 */

async function testFunctionPathDebug() {
  console.log('🧪 Testing Function Path Debug');
  console.log('=' .repeat(50));

  try {
    // Test 1: Direct function call
    console.log('\n📝 Test 1: Direct function call');
    console.log('URL: /.netlify/functions/invitation-unified');
    
    const directResponse = await fetch('http://localhost:8888/.netlify/functions/invitation-unified', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const directData = await directResponse.json();
    console.log('📊 Response:', directData);
    console.log('📊 Path received by function:', directData.path);
    console.log('📊 Method received by function:', directData.method);

    // Test 2: Via redirect (the actual endpoint)
    console.log('\n📝 Test 2: Via redirect (actual endpoint)');
    console.log('URL: /api/authenticated/generate-peer-invite');
    
    const redirectResponse = await fetch('http://localhost:8888/api/authenticated/generate-peer-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    console.log('📊 Status:', redirectResponse.status);
    
    if (redirectResponse.status === 404) {
      const errorText = await redirectResponse.text();
      console.log('📊 Error response:', errorText);
    } else {
      const redirectData = await redirectResponse.json();
      console.log('📊 Response:', redirectData);
      console.log('📊 Path received by function:', redirectData.path);
      console.log('📊 Method received by function:', redirectData.method);
    }

    // Test 3: Check if the redirect is working at all
    console.log('\n📝 Test 3: Testing other working endpoints for comparison');
    
    const authResponse = await fetch('http://localhost:8888/api/auth/session', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('📊 Auth endpoint status:', authResponse.status);
    if (authResponse.status !== 404) {
      console.log('✅ Auth endpoint is working (redirects are functional)');
    } else {
      console.log('❌ Auth endpoint also failing (general redirect issue)');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testFunctionPathDebug().catch(console.error);

#!/usr/bin/env node

/**
 * Test Peer Invitation Endpoint Only
 * Tests just the peer invitation generation with a mock JWT token
 */

async function testPeerInvitationEndpoint() {
  console.log('🧪 Testing Peer Invitation Endpoint');
  console.log('=' .repeat(50));

  try {
    // Create a mock JWT token for testing
    const mockPayload = {
      userId: 'test-user-id',
      username: 'testuser',
      nip05: 'testuser@satnam.pub',
      role: 'private',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };

    // Create a simple JWT token (for testing only)
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(mockPayload)).toString('base64url');
    
    // Use a simple signature (this would normally use the server's secret)
    const mockSignature = 'mock-signature-for-testing';
    const mockToken = `${encodedHeader}.${encodedPayload}.${mockSignature}`;

    console.log('🔍 Generated mock JWT token for testing');
    console.log('📊 Token payload:', {
      username: mockPayload.username,
      nip05: mockPayload.nip05,
      role: mockPayload.role
    });

    // Test the peer invitation endpoint
    const inviteData = {
      inviteType: 'peer',
      message: 'Join me on Satnam!',
      expiresIn: 24
    };

    console.log('\n🔄 Testing POST /api/authenticated/generate-peer-invite');
    console.log('📊 Request data:', inviteData);

    const response = await fetch('http://localhost:8888/api/authenticated/generate-peer-invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mockToken}`
      },
      body: JSON.stringify(inviteData)
    });

    console.log('\n📊 Response status:', response.status);
    console.log('📊 Response headers:', Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log('📊 Raw response:', responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''));

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('❌ Failed to parse response as JSON');
      console.error('📊 Parse error:', parseError.message);
      console.error('📊 Response text:', responseText);
      return;
    }

    if (response.ok) {
      console.log('\n✅ Peer invitation generation successful!');
      console.log('📊 Response data:', {
        success: responseData.success,
        hasInviteCode: !!responseData.inviteCode,
        hasInviteUrl: !!responseData.inviteUrl,
        hasQrCode: !!responseData.qrCode,
        inviteType: responseData.invitation?.type,
        expiresAt: responseData.invitation?.expiresAt
      });

      if (responseData.inviteCode) {
        console.log('📊 Invite code:', responseData.inviteCode.substring(0, 8) + '...');
      }
      if (responseData.inviteUrl) {
        console.log('📊 Invite URL:', responseData.inviteUrl);
      }

    } else {
      console.log('\n❌ Peer invitation generation failed');
      console.log('📊 Error response:', responseData);
      
      if (response.status === 401) {
        console.log('💡 401 Unauthorized - Token validation issue (expected with mock token)');
      } else if (response.status === 404) {
        console.log('💡 404 Not Found - Endpoint routing issue');
      } else if (response.status === 500) {
        console.log('💡 500 Internal Server Error - Function implementation issue');
      }
    }

  } catch (error) {
    console.error('❌ Test failed with network/connection error:', error.message);
    console.error('💡 Make sure Netlify dev server is running on port 8888');
    console.error('Stack trace:', error.stack);
  }
}

async function testEndpointRouting() {
  console.log('\n🧪 Testing Endpoint Routing');
  console.log('=' .repeat(50));

  try {
    // Test without authorization to see if endpoint exists
    const response = await fetch('http://localhost:8888/api/authenticated/generate-peer-invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    console.log('📊 Response status (no auth):', response.status);
    
    if (response.status === 404) {
      console.log('❌ Endpoint not found - routing issue');
    } else if (response.status === 401) {
      console.log('✅ Endpoint found - returns 401 as expected (no auth token)');
    } else {
      console.log('📊 Unexpected status - endpoint may have issues');
    }

    const responseText = await response.text();
    console.log('📊 Response preview:', responseText.substring(0, 100) + '...');

  } catch (error) {
    console.error('❌ Routing test failed:', error.message);
  }
}

async function runTests() {
  await testEndpointRouting();
  await testPeerInvitationEndpoint();
  
  console.log('\n📋 Summary:');
  console.log('1. Endpoint routing verification');
  console.log('2. Peer invitation generation test');
  console.log('3. Response format validation');
}

runTests().catch(console.error);

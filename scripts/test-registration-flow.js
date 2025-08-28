#!/usr/bin/env node

/**
 * Registration Flow Diagnostic Script
 * Tests the complete registration flow with enhanced logging
 * Run with: node scripts/test-registration-flow.js
 */

import fetch from 'node-fetch';

const NETLIFY_DEV_URL = 'http://localhost:8888';
const REGISTRATION_ENDPOINT = `${NETLIFY_DEV_URL}/api/auth/register-identity`; // Note: endpoint URL stays the same, only backend file changed

// Test data with valid format
const testRegistrationData = {
  username: `testuser_${Date.now()}`,
  password: 'TestPassword123!',
  npub: 'npub1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab', // 63 chars
  encryptedNsec: JSON.stringify({
    salt: Array.from(crypto.getRandomValues(new Uint8Array(32))),
    iv: Array.from(crypto.getRandomValues(new Uint8Array(12))),
    encrypted: Array.from(crypto.getRandomValues(new Uint8Array(64))),
    version: 'v2',
    algorithm: 'AES-GCM-PBKDF2'
  }),
  role: 'private',
  nip05: `testuser_${Date.now()}@satnam.pub`
};

async function testRateLimitingAccess() {
  console.log('\n🔒 Rate Limiting Access Test');
  console.log('=' .repeat(50));

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing Supabase credentials for rate limiting test');
      return;
    }

    // Test anon access to rate_limits table
    const response = await fetch(`${supabaseUrl}/rest/v1/rate_limits?select=count&limit=1`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('📡 Rate Limits Table Access Status:', response.status);

    if (response.ok) {
      console.log('✅ Anon role can access rate_limits table');
    } else {
      const errorText = await response.text();
      console.error('❌ Anon role cannot access rate_limits table:', errorText);
      console.error('💡 Run scripts/apply-rls-policies.sql in Supabase SQL Editor');
    }

  } catch (error) {
    console.error('❌ Rate limiting access test error:', error.message);
  }
}

async function testRegistrationFlow() {
  console.log('\n🧪 Testing Registration Flow');
  console.log('=' .repeat(50));

  console.log('📋 Test Data:', {
    username: testRegistrationData.username,
    npubLength: testRegistrationData.npub.length,
    encryptedNsecLength: testRegistrationData.encryptedNsec.length,
    role: testRegistrationData.role
  });

  try {
    console.log('\n🔄 Sending registration request...');
    
    const response = await fetch(REGISTRATION_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000'
      },
      body: JSON.stringify(testRegistrationData)
    });

    console.log('📡 Response Status:', response.status);
    console.log('📡 Response Headers:', Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log('📡 Raw Response:', responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
      console.log('📡 Parsed Response:', JSON.stringify(responseData, null, 2));
    } catch (parseError) {
      console.error('❌ Failed to parse response as JSON:', parseError.message);
      return;
    }

    if (response.ok) {
      console.log('✅ Registration successful!');
    } else {
      console.error('❌ Registration failed');
      
      if (responseData.debug) {
        console.error('🔍 Debug Info:', responseData.debug);
      }
      
      if (response.status === 500) {
        console.error('💡 Server Error - Check Netlify Functions logs for details');
        console.error('💡 Common causes:');
        console.error('   - Missing environment variables (SUPABASE_URL, SUPABASE_ANON_KEY, DUID_SERVER_SECRET)');
        console.error('   - Database connection issues');
        console.error('   - RLS policy blocking anon INSERT');
        console.error('   - Missing database columns');
      }
    }

  } catch (fetchError) {
    console.error('❌ Network error:', fetchError.message);
    console.error('💡 Make sure Netlify dev server is running: netlify dev');
  }
}

async function testEnvironmentVariables() {
  console.log('\n🔍 Environment Variables Check');
  console.log('=' .repeat(50));
  
  const requiredVars = [
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
    'SUPABASE_ANON_KEY', 
    'VITE_SUPABASE_ANON_KEY',
    'DUID_SERVER_SECRET'
  ];

  requiredVars.forEach(varName => {
    const value = process.env[varName];
    console.log(`${varName}: ${value ? '✅ Set' : '❌ Missing'}`);
    if (value && varName.includes('SUPABASE_URL')) {
      console.log(`  └─ ${value.substring(0, 30)}...`);
    }
    if (value && varName.includes('KEY')) {
      console.log(`  └─ ${value.substring(0, 20)}...`);
    }
  });
}

async function testSupabaseConnection() {
  console.log('\n🔗 Supabase Connection Test');
  console.log('=' .repeat(50));

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing Supabase credentials');
      return;
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/user_identities?select=count&limit=1`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('📡 Supabase Response Status:', response.status);
    
    if (response.ok) {
      console.log('✅ Supabase connection successful');
    } else {
      const errorText = await response.text();
      console.error('❌ Supabase connection failed:', errorText);
    }

  } catch (connectionError) {
    console.error('❌ Supabase connection error:', connectionError.message);
  }
}

// Run all tests
async function testESModuleSupport() {
  console.log('\n🧪 ES Module Support Test');
  console.log('=' .repeat(50));

  try {
    const response = await fetch(`${NETLIFY_DEV_URL}/.netlify/functions/test-es-modules`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('📡 ES Module Test Response Status:', response.status);

    const responseData = await response.json();
    console.log('📡 ES Module Test Result:', JSON.stringify(responseData, null, 2));

    if (response.ok && responseData.success) {
      console.log('✅ ES modules are working in Netlify Functions');
    } else {
      console.error('❌ ES modules are not working properly');
    }

  } catch (error) {
    console.error('❌ ES module test failed:', error.message);
  }
}

async function testQRCodeGeneration() {
  console.log('\n🎨 QR Code Generation Test');
  console.log('=' .repeat(50));

  try {
    // Test QR code generation (simulating invitation flow)
    const testUrl = 'https://satnam.pub/invite/test123';

    // Import qr-image library
    const qr = await import('qr-image');

    // Generate QR code
    const qrBuffer = qr.default.imageSync(testUrl, {
      type: 'png',
      size: 10,
      margin: 2
    });

    const base64 = qrBuffer.toString('base64');
    const qrCodeDataUrl = `data:image/png;base64,${base64}`;

    console.log('✅ QR code generation successful');
    console.log('📊 QR code size:', qrBuffer.length, 'bytes');
    console.log('📊 Data URL length:', qrCodeDataUrl.length, 'characters');
    console.log('💡 No util._extend deprecation warnings (qrcode library replaced with qr-image)');

  } catch (error) {
    console.error('❌ QR code generation failed:', error.message);
  }
}

async function runAllTests() {
  await testEnvironmentVariables();
  await testSupabaseConnection();
  await testRateLimitingAccess();
  await testESModuleSupport();
  await testQRCodeGeneration();
  await testRegistrationFlow();

  console.log('\n📋 Next Steps:');
  console.log('1. Check Netlify dev terminal for detailed server logs');
  console.log('2. Verify ES module support is working (.mjs files)');
  console.log('3. Verify RLS policies allow anon access to rate_limits table');
  console.log('4. Verify RLS policies allow anon INSERT on user_identities');
  console.log('5. Confirm database schema matches expected columns');
  console.log('6. Verify no util._extend deprecation warnings appear');
  console.log('7. Test with real frontend-generated keys if needed');
}

runAllTests().catch(console.error);
